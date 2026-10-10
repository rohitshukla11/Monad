// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Monad testnet constants. Each is checked against the chain by test/fork/MonadTestnet.t.sol.
library MonadTestnet {
    /// @dev https://docs.monad.xyz/developer-essentials/testnet.md (eth_chainId returns 0x279f)
    uint256 internal constant CHAIN_ID = 10143;

    /// @dev Circle USDC, 6 decimals.
    ///      https://developers.circle.com/stablecoins/usdc-contract-addresses (Monad Testnet)
    ///      also in https://github.com/monad-crypto/token-list/blob/main/tokenlist-testnet.json
    ///      Faucet: https://faucet.circle.com
    address internal constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
}
