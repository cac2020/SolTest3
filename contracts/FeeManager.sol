// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title FeeManager
 * @dev 手续费管理器，根据拍卖金额动态计算手续费
 */
contract FeeManager is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // 基础手续费率（万分数）
    uint256 public baseFeeRate;
    
    // 阶梯费率结构体
    struct TieredRate {
        uint256 threshold; // 金额阈值
        uint256 rate;      // 费率
    }
    // 阶梯费率数组（按threshold升序排列）
    TieredRate[] public tieredRates;
    
    // 手续费接收地址
    address public feeReceiver;

    //基础手续费率更新事件
    event BaseFeeRateUpdated(uint256 newRate);
    //阶梯费率配置（金额阈值）更新事件
    event TieredRateUpdated(uint256 threshold, uint256 rate);
    //手续费接收地址更新事件
    event FeeReceiverUpdated(address newReceiver);
    
    /**
     * @dev 构造函数，防止直接初始化实现合约
     * 在可升级合约构造函数上方必须添加注释 /// @custom:oz-upgrades-unsafe-allow constructor
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev 初始化函数
     * @param initialOwner 合约拥有者
     * @param _feeReceiver 手续费接收地址
     * @param _feeReceiver 手续费接收地址
     */
    function initialize(
        address initialOwner,
        uint256 _baseFeeRate,
        address _feeReceiver
    ) public initializer {
        __Ownable_init(initialOwner);
        require(_baseFeeRate <= 10000, "Rate too high"); // 最高100%
        require(_feeReceiver != address(0), "Invalid receiver");
        
        baseFeeRate = _baseFeeRate;
        feeReceiver = _feeReceiver;
    }
    
    /**
     * @dev 计算手续费
     * @param amount 拍卖金额
     * @return 手续费率（万分数）和接收地址
     */
    function calculateFee(uint256 amount) external view returns (uint256, address) {
        // 查找适用的阶梯费率（二分查找优化）
        uint256 applicableRate = baseFeeRate;
        uint256 left = 0;
        uint256 right = tieredRates.length;
        
        while (left < right) {
            uint256 mid = (left + right) / 2;
            if (tieredRates[mid].threshold <= amount) {
                applicableRate = tieredRates[mid].rate;
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        
        return (applicableRate, feeReceiver);
    }
    
    /**
     * @dev 获取指定索引的阶梯费率
     * @param index 索引
     * @return threshold 阶梯费阈值
     * @return rate 阶梯费率
     */
    function getTieredRate(uint256 index) external view returns (uint256 threshold, uint256 rate) {
        require(index < tieredRates.length, "Index out of bounds");
        TieredRate memory tier = tieredRates[index];
        return (tier.threshold, tier.rate);
    }
    
    /**
     * @dev 添加或更新阶梯费率（保持数组有序）
     * @param threshold 金额阈值
     * @param rate 费率
     */
    function setTieredRate(uint256 threshold, uint256 rate) external onlyOwner {
        require(rate <= 10000, "Rate too high");
        
        // 查找插入位置或更新现有项 默认时末尾
        uint256 index = tieredRates.length;
        for (uint256 i = 0; i < tieredRates.length; i++) {
            //阈值相等 直接更新
            if (tieredRates[i].threshold == threshold) {
                tieredRates[i].rate = rate;
                emit TieredRateUpdated(threshold, rate);
                return;
            }
            //小于当前阈值则插入前面  大于当前阈值继续往后找 
            if (tieredRates[i].threshold > threshold) {
                index = i;
                break;
            }
        }
        
        // 插入新项并保持数组有序
        tieredRates.push();
        for (uint256 i = tieredRates.length - 1; i > index; i--) {
            //依次往后挪
            tieredRates[i] = tieredRates[i - 1];
        }
        //插入新的阈值 费率
        tieredRates[index] = TieredRate(threshold, rate);
        emit TieredRateUpdated(threshold, rate);
    }
    
    /**
     * @dev 更新手续费接收地址
     * @param newReceiver 新的接收地址
     */
    function setFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid receiver");
        feeReceiver = newReceiver;
        emit FeeReceiverUpdated(newReceiver);
    }
    
    /**
     * @dev UUPS升级授权
     * @param newImplementation 新的实现合约
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}
