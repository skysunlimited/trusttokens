pragma solidity ^0.5.13;

import { StakingAsset } from "./StakingAsset.sol";
import { AStakedToken } from "./AStakedToken.sol";
import { Registry } from "@trusttoken/registry/contracts/Registry.sol";
import { RegistrySubscriber } from "./RegistrySubscriber.sol";

/**
 * @title StakedToken
 * @dev Implementation of AStakedToken
**/
contract StakedToken is AStakedToken {
    StakingAsset stakeAsset_;
    StakingAsset rewardAsset_;
    Registry registry_;
    address liquidator_;

    /**
     * @dev configure this contract
     */
    function configure(
        StakingAsset _stakeAsset,
        StakingAsset _rewardAsset,
        Registry _registry,
        address _liquidator
    ) external {
        require(!initalized, "already initalized StakedToken");
        stakeAsset_ = _stakeAsset;
        rewardAsset_ = _rewardAsset;
        registry_ = _registry;
        liquidator_ = _liquidator;
        initialize();
        initalized = true;
    }

    function stakeAsset() internal view returns (StakingAsset) {
        return stakeAsset_;
    }

    function rewardAsset() internal view returns (StakingAsset) {
        return rewardAsset_;
    }

    function registry() internal view returns (Registry) {
        return registry_;
    }

    function liquidator() internal view returns (address) {
        return liquidator_;
    }
}
