// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MyToken} from "./MyToken.sol";
import {MyNFT} from "./MyNFT.sol";

contract TokenSale {
    uint256 public immutable ratio;
    uint256 public price;
    MyToken public paymentToken;
    MyNFT public nftCollection;

    constructor(
        uint256 _ratio,
        uint256 _price,
        MyToken _paymentToken,
        MyNFT _nftCollection
    ) {
        ratio = _ratio;
        price = _price;
        paymentToken = _paymentToken;
        nftCollection = _nftCollection;
    }

    receive() external payable {}

    function buyTokens() external payable {
        // calls the _mint(<address>, <value>) function of ERC20 -> which calls _update(<from = address(0)>, <to>, <value> )
        // so whoever calls this function, externally, will send ETH to the ERC20 contract in exchange for tokens
        paymentToken.mint(msg.sender, msg.value * ratio);
        // right now all this does is update the _totalSupply of paymentToken AND the _balance(msg.sender) (whoever called)
        //! -> so have to call returnTokens() in here?
    }

    function returnTokens(uint256 amount) external {
        paymentToken.burnFrom(msg.sender, amount);
        payable(msg.sender).transfer(amount / ratio);
    }
}
