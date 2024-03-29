import { viem } from "hardhat";
import { parseEther, formatEther, toHex, hexToString } from "viem";

const PROPOSALS = ["Chocolate", "Vanilla", "Strawberry"];

async function main() {
  console.log("Deploying...");

  async function deployContracts() {
    //! Deploy Contracts
    const publicClient = await viem.getPublicClient();
    const [deployer, account1] = await viem.getWalletClients();
    const tokenContract = await viem.deployContract("MyToken");

    console.log(`\n Token Contract deployed at ${tokenContract.address}`);
    console.log(deployer.account.address);

    /* -----------------------------------------------------------------*/
    const deployerWalletBalance = await publicClient.getBalance({
      address: deployer.account.address,
    });
    console.log({ deployerWalletBalance });

    const deployerVotes = await tokenContract.read.getVotes([
      deployer.account.address,
    ]);
    console.log({ deployerVotes });

    const tokenContractTotalSupply = await tokenContract.read.totalSupply();
    console.log({ tokenContractTotalSupply });
    const deployerTokenBalance = await tokenContract.read.balanceOf([
      deployer.account.address,
    ]);
    console.log({ deployerTokenBalance });
    console.log(
      "\n------------------ Buy 1 Tokens  -> Delegate to get voting power ------------------------------------------------\n"
    );

    //! Get tokens
    await tokenContract.write.mint([deployer.account.address, parseEther("1")]);
    await tokenContract.write.delegate([deployer.account.address]);

    const deployerWalletBalance2 = await publicClient.getBalance({
      address: deployer.account.address,
    });
    const deployerVotes_2 = await tokenContract.read.getVotes([
      deployer.account.address,
    ]);
    const tokenContractTotalSupply2 = await tokenContract.read.totalSupply();
    const deployerTokenBalance2 = await tokenContract.read.balanceOf([
      deployer.account.address,
    ]);

    console.log({ deployerWalletBalance2 });
    console.log({ deployerVotes_2 });
    console.log({ tokenContractTotalSupply2 });
    console.log({ deployerTokenBalance2 });

    console.log(
      "\n----- Deploy ballot contract ->  Call vote() -------------------------------\n"
    );
    const tokenizedBallotContract = await viem.deployContract(
      "TokenizedBallot",
      [
        PROPOSALS.map((prop) => toHex(prop, { size: 32 })),
        tokenContract.address,
        3n,
      ]
    );
    console.log(
      `\n TokenizedBallot Contract deployed at ${tokenizedBallotContract.address}`
    );
    const pastVotes = await tokenContract.read.getPastVotes([
      deployer.account.address,
      0n,
    ]);
    console.log({ pastVotes });

    const deployerVotePowerSent =
      await tokenizedBallotContract.read.votePowerSent([
        deployer.account.address,
      ]);
    console.log({ deployerVotePowerSent });

    //! I thought this was needed? I guess not, my tests still ran
    // await tokenContract.write.approve([
    //   tokenizedBallotContract.address,
    //   parseEther("1"),
    // ]);

    // const blockNumber = await publicClient.getBlockNumber();
    // console.log({ blockNumber });
    //! Error here
    const deployerVotesUsed1 = await tokenizedBallotContract.read.votePowerSent(
      [deployer.account.address]
    );
    await tokenizedBallotContract.write.vote([1n, parseEther(".25")]);
    console.log("\nVote casted\n");
    const deployerVotesUsed = await tokenizedBallotContract.read.votePowerSent([
      deployer.account.address,
    ]);

    // const deployerWalletBalance3 = await publicClient.getBalance({
    //   address: deployer.account.address,
    // });
    const deployerVotes_3 = await tokenContract.read.getVotes([
      deployer.account.address,
    ]);
    // const tokenContractTotalSupply3 = await tokenContract.read.totalSupply();
    // const deployerTokenBalance3 = await tokenContract.read.balanceOf([
    //   deployer.account.address,
    // ]);

    // console.log({ deployerWalletBalance3 });
    console.log({ deployerVotes_3 });
    // console.log({ tokenContractTotalSupply3 });
    // console.log({ deployerTokenBalance3 });

    console.log({ deployerVotesUsed1 });
    console.log({ deployerVotesUsed });

    console.log(
      "\n----------- Check if votes on proposal persisted -----------\n"
    );
    const proposals = await tokenizedBallotContract.read.getAllProposals();
    proposals.forEach((proposal) => {
      console.log(hexToString(proposal.name));
      console.log(proposal.voteCount);
    });

    console.log("Checking voter stats");
    console.log(
      await tokenContract.read.getVotes([deployer.account.address]),
      await tokenContract.read.getPastVotes([deployer.account.address, 3n]),
      await tokenizedBallotContract.read.votePowerSent([
        deployer.account.address,
      ])
    );
  }

  // Don't forget to call functions
  await deployContracts();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
