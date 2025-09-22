// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
//冗余引入
import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/shared/mocks/MockV3Aggregator.sol";

import "hardhat/console.sol";

/**
 * @title PriceConverter
 * @dev 价格转换工具，使用Chainlink预言机将代币金额转换为美元价值
 */
library PriceConverter {
    // 定义自定义错误
    error InvalidPrice();
    error IncompleteRound();
    error StalePrice();
    error MultiplicationOverflow();

    /**
     * @dev 获取最新价格
     * @param priceFeed 价格接口
     * @return 最新价格
     */
    function getLatestPrice(
        AggregatorV3Interface priceFeed
    ) internal view returns (int256) {
        // 从价格预言机获取最新一轮的价格数据
        // roundId 当前价格数据的轮次ID
        // price 最新的价格值，*****可能为负数******
        // startedAt 价格数据开始时的时间戳
        // updatedAt 价格更新的时间戳
        //answeredInRound 价格实际对应的轮次ID
        (
            uint80 roundId,
            int256 price,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        //chaink 返回价格可能出现负数
        //require(price > 0, "Invalid price");
        if (price <= 0) {
            revert InvalidPrice();
        }
        // 验证价格数据的有效性
        // 检查更新时间是否有效，确保价格数据完整
        //require(updatedAt > 0, "Incomplete round");
        if (updatedAt <= 0) {
            revert IncompleteRound();
        }
        // 检查价格数据是否为最新，防止使用过期价格
        //require(answeredInRound >= roundId, "Stale price");
        if (answeredInRound < roundId) {
            revert StalePrice();
        }
        return price;
    }

    /**
     * @dev 将代币金额转换为美元价值
     * @param amount 代币数量
     * @param priceFeed_ 价格预言机
     * @return 美元价值（单位：wei对应的美元价值）
     */
    function getUsdValue(
        uint256 amount,
        address priceFeed_
    ) external view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeed_);
        int256 price = getLatestPrice(priceFeed);
        //require(price > 0, "Invalid price");
        if (price <= 0) {
            revert InvalidPrice();
        }
        // 价格预言机返回的价格通常有8-18位小数，需要根据实际情况调整
        // 假设代币有18位小数
        uint256 priceDecimals = priceFeed.decimals();
        // 确保不会发生溢出
        uint256 positivePrice = uint256(price);
        /*require(
            amount == 0 || (positivePrice <= type(uint256).max / amount),
            "Multiplication overflow"
        );*/

        if (amount != 0 && positivePrice > type(uint256).max / amount) {
            revert MultiplicationOverflow();
        }

        // 计算美元价值：(amount * price) / (10^priceDecimals)
        return (amount * positivePrice) / (10 ** priceDecimals);
    }
}
