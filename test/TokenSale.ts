import { expect } from "chai";
import { viem } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther, formatEther } from "viem";

const TEST_RATIO = 10n;
const TEST_PRICE = 5n;
const TEST_BUY_AMOUNT = "10";

async function fixture() {
  const publicClient = await viem.getPublicClient();
  const myTokenContract = await viem.deployContract("MyToken", []);
  const myNftContract = await viem.deployContract("MyNFT", []);
  const tokenSaleContract = await viem.deployContract("TokenSale", [
    TEST_RATIO,
    TEST_PRICE,
    myTokenContract.address,
    myNftContract.address,
  ]);

  // Grant minter-role to instance of TokenSale Contract! NOT the deployer
  const minterRole = await myTokenContract.read.MINTER_ROLE();
  await myTokenContract.write.grantRole([
    minterRole,
    tokenSaleContract.address,
  ]);

  const [deployer, acc1, acc2] = await viem.getWalletClients();

  return {
    publicClient,
    myTokenContract,
    myNftContract,
    tokenSaleContract,
    deployer,
    acc1,
    acc2,
  };
}

describe("NFT Shop", async () => {
  describe("When the Shop contract is deployed", async () => {
    it("defines the ratio as provided in parameters", async () => {
      const { tokenSaleContract } = await loadFixture(fixture);
      const ratio = await tokenSaleContract.read.ratio();
      expect(ratio).to.eq(TEST_RATIO);
    });
    it("defines the price as provided in parameters", async () => {
      const { tokenSaleContract } = await loadFixture(fixture);
      const price = await tokenSaleContract.read.price();
      expect(price).to.eq(TEST_PRICE);
    });
    it("uses a valid ERC20 as payment token", async () => {
      const { tokenSaleContract } = await loadFixture(fixture);
      const paymentTokenAddress = await tokenSaleContract.read.paymentToken();

      const paymentTokenContract = await viem.getContractAt(
        "ERC20",
        paymentTokenAddress
      );
      // An ERC20 token should have a property _totalSupply, regardless of the value this should go through
      await expect(paymentTokenContract.read.totalSupply()).to.be.not.rejected;
    });
    it("uses a valid ERC721 as NFT collection", async () => {
      const { tokenSaleContract, myNftContract } = await loadFixture(fixture);
      await expect(myNftContract.read.name()).to.be.not.rejected;
      await expect(myNftContract.read.balanceOf([myNftContract.address])).to.be
        .not.rejected;
    });
  });
  describe("When a user buys an ERC20 from the Token contract", async () => {
    it("charges the correct amount of ETH", async () => {
      const { tokenSaleContract, deployer, publicClient } = await loadFixture(
        fixture
      );

      // Initial balance of the deployer: pre-funded account
      const deployerBalance = await publicClient.getBalance({
        address: deployer.account.address,
      });

      // deployer call buyToken() of tokenSaleContract
      // buyToken, takes in ETH that's why it needs to be payable.
      const tx_hash = await tokenSaleContract.write.buyTokens({
        value: parseEther(TEST_BUY_AMOUNT),
        account: deployer.account.address,
      });

      // Wait for the tx to get confirmed
      const tx_receipt = await publicClient.getTransactionReceipt({
        hash: tx_hash,
      });
      // calculate tx fees
      const gasAmount = tx_receipt.gasUsed;
      const gasPrice = tx_receipt.effectiveGasPrice;
      const txFees = gasAmount * gasPrice;

      const deployerBalanceAfter = await publicClient.getBalance({
        address: deployer.account.address,
      });

      // the difference should be: the initial amount - (amount bought + tx fees)
      const diff = deployerBalance - deployerBalanceAfter;
      const expected_diff = parseEther(TEST_BUY_AMOUNT) + txFees;
      expect(diff).to.be.eq(expected_diff);
    });

    it("gives the correct amount of tokens", async () => {
      const { tokenSaleContract, myTokenContract, deployer, acc1, acc2 } =
        await loadFixture(fixture);

      // Initial _balance[address] of acc 1 should be 0
      const tokenBalanceBefore = await myTokenContract.read.balanceOf([
        acc1.account.address,
      ]);

      // acc 1 buys tokens
      const tx = await tokenSaleContract.write.buyTokens({
        value: parseEther(TEST_BUY_AMOUNT),
        account: acc1.account.address,
      });
      const tokenBalanceAfter = await myTokenContract.read.balanceOf([
        acc1.account.address,
      ]);
      const diff = tokenBalanceAfter - tokenBalanceBefore;
      expect(diff).to.be.eq(parseEther(TEST_BUY_AMOUNT) * TEST_RATIO);
    });
  });
  describe("When a user burns an ERC20 at the Shop contract", async () => {
    it("gives the correct amount of ETH", async () => {
      // First I'll need to buy an ERC20 token
      // Then I'll burn it by sending to address 0
      // I should get the ETH back
      // check initial bal, bal after buying, bal after
      const { publicClient, tokenSaleContract, myTokenContract, deployer } =
        await loadFixture(fixture);

      const initialEthBalance = await publicClient.getBalance({
        address: deployer.account.address,
      });

      // deployer buys tokens
      await tokenSaleContract.write.buyTokens({
        value: parseEther(TEST_BUY_AMOUNT),
      });

      // deployer balance should have decreased
      const deployerEthBalance = await publicClient.getBalance({
        address: deployer.account.address,
      });

      // Allow <1st argument> to use <2nd argument> amount of caller's money
      const hash1 = await myTokenContract.write.approve([
        tokenSaleContract.address,
        parseEther(TEST_BUY_AMOUNT),
      ]);
      const receipt1 = await publicClient.getTransactionReceipt({
        hash: hash1,
      });
      const txFees1 = receipt1.gasUsed * receipt1.effectiveGasPrice;

      //! Before we can burn. we need to allocate allowance
      const hash = await tokenSaleContract.write.returnTokens([
        parseEther(TEST_BUY_AMOUNT),
      ]);
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const txFees = receipt.gasUsed * receipt.effectiveGasPrice;

      // balance after burning
      // since I get some Eth back this should be greater than deployerEthBalance1
      const deployerEthBalance2 = await publicClient.getBalance({
        address: deployer.account.address,
      });

      const diff = deployerEthBalance2 - deployerEthBalance; // this diff is the amount of ETH returned
      const expected_diff =
        parseEther(TEST_BUY_AMOUNT) / TEST_RATIO - (txFees + txFees1);
      // Expect
      expect(diff).to.eq(expected_diff); // possibly + tax fees
    });
    it("burns the correct amount of tokens", async () => {
      // call the tokencontract to approve amount to the token sale contract
      // call the tokensalecontract for return tokens function
      // check the token balance of the user
      const { myTokenContract, tokenSaleContract, deployer, publicClient } =
        await loadFixture(fixture);

      // this should be the default of 0
      const allowance = await myTokenContract.read.allowance([
        deployer.account.address, //owner
        tokenSaleContract.address, //spender
      ]);

      const hash = await myTokenContract.write.approve([
        tokenSaleContract.address,
        100n,
      ]);

      // This should return _allowance[deployer][contract]: how much it can spend using deployer's money?
      const allowance2 = await myTokenContract.read.allowance([
        deployer.account.address,
        tokenSaleContract.address,
      ]);

      // Deployer should default to 0 balance
      const deployer_balance = await myTokenContract.read.balanceOf([
        deployer.account.address,
      ]);

      // need to mint() to increase balance?
      // buyTokens() increases the balance of the caller AND totalSupply of the tokenContract
      await tokenSaleContract.write.buyTokens({ value: 10n });
      const deployer_balance2 = await myTokenContract.read.balanceOf([
        deployer.account.address,
      ]);

      // Now that we have bought tokens, let's burn them!
      const hash2 = await tokenSaleContract.write.returnTokens([1n]);
      const receipt = await publicClient.getTransactionReceipt({ hash: hash2 });

      // Need to account for gas
      const gasAmount = receipt.gasUsed;
      const gasPrice = receipt.effectiveGasPrice;
      const txFees = gasAmount * gasPrice;

      const deployer_balance3 = await myTokenContract.read.balanceOf([
        deployer.account.address,
      ]);

      // buyTokens() w/ value 10n => totalSupply: 100n
      // returnTokens([1n]) => totalSupply: 99n
      expect(await myTokenContract.read.totalSupply()).to.eq(99n);
    });
  });
  describe("When a user buys an NFT from the Shop contract", async () => {
    it("charges the correct amount of ERC20 tokens", async () => {
      throw new Error("Not implemented");
    });
    it("gives the correct NFT", async () => {
      throw new Error("Not implemented");
    });
  });
  describe("When a user burns their NFT at the Shop contract", async () => {
    it("gives the correct amount of ERC20 tokens", async () => {
      throw new Error("Not implemented");
    });
  });
  describe("When the owner withdraws from the Shop contract", async () => {
    it("recovers the right amount of ERC20 tokens", async () => {
      throw new Error("Not implemented");
    });
    it("updates the owner pool account correctly", async () => {
      throw new Error("Not implemented");
    });
  });
});
