// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {FeeManager} from "./FeeManager.sol";
import {Auction} from "./Auction.sol";

/**
 * @title AuctionFactory
 * @dev 拍卖工厂合约，负责创建和管理拍卖合约实例,类似Uniswap V2风格的工厂模式和UUPS可升级模式
 * 用 Clones.sol 实现拍卖工厂模式，
 * 工厂合约负责：
 *  - 部署模板合约（或接收外部模板地址）。
 *  - 通过 Clones.sol 创建拍卖克隆体，并初始化。
 *  - 维护拍卖实例的全局映射（通过唯一标识查询）。
 */
contract AuctionFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    // 存储不同NFT合约 对应的具体NFT 对应的拍卖 (NFT合约地址 => tokenId => 拍卖合约地址)
    mapping(address => mapping(uint256 => address)) public nftToAuction;

    // 所有拍卖合约地址列表
    address[] public allAuctions;

    // 手续费管理器
    FeeManager public feeManager;

    // 拍卖合约实现地址（用于创建新拍卖）
    address public auctionImplementation;

    // 创建拍卖事件
    event AuctionCreated(
        address indexed auction,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 startTime,
        uint256 endTime,
        uint256 startPrice,
        address paymentToken
    );
    // 更新手续费管理器事件
    event FeeManagerUpdated(address newFeeManager);
    // 更新拍卖实现合约事件
    event AuctionImplementationUpdated(address newImplementation);

    /**
     * @dev 构造函数，防止直接初始化实现合约
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化函数
     * @param initialOwner 合约拥有者
     * @param _feeManager 手续费管理器
     * @param _auctionImplementation 拍卖实现合约
     */
    function initialize(
        address initialOwner,
        address _feeManager,
        address _auctionImplementation
    ) public initializer {
        __Ownable_init(initialOwner);
        require(_feeManager != address(0), "Invalid fee manager");
        require(
            _auctionImplementation != address(0),
            "Invalid auction implementation"
        );

        feeManager = FeeManager(_feeManager);
        auctionImplementation = _auctionImplementation;
    }

    /**
     * @dev 创建新的拍卖 调用者为NFT的拥有者
     * @param nftContract NFT合约地址
     * @param tokenId NFT的tokenId
     * @param duration 拍卖持续时间（秒）
     * @param startPrice 起拍价
     * @param paymentToken 支付代币地址（0地址表示ETH）
     * @return auction 新创建的拍卖合约地址
     */
    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 duration,
        uint256 startPrice,
        address paymentToken
    ) external returns (address auction) {
        require(nftContract != address(0), "Invalid NFT contract");
        require(duration > 3600, "Duration must be positive");
        require(startPrice > 0, "Start price must be positive");

        // 检查NFT是否已在拍卖中
        require(
            nftToAuction[nftContract][tokenId] == address(0),
            "NFT already in auction"
        );

        // 检查调用者是否为NFT所有者且已授权（在MyNFT里调用授权方法approve或setApprovalForAll进行授权）
        IERC721 nft = IERC721(nftContract);
        require(nft.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(
            nft.isApprovedForAll(msg.sender, address(this)) ||
                nft.getApproved(tokenId) == address(this),
            "Factory not authorized"
        );

        // 计算拍卖时间
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + duration;

        // 使用最小代理模式创建拍卖合约
        auction = Clones.clone(auctionImplementation);

        // 初始化拍卖合约
        Auction(payable(auction)).initialize(
            msg.sender, // 卖家
            nftContract, // NFT合约
            tokenId, // tokenId
            startPrice, // 起拍价
            startTime, // 开始时间
            endTime, // 结束时间
            paymentToken, // 支付代币
            address(feeManager), // 手续费管理器
            address(this) // 工厂合约
        );

        // 记录拍卖信息
        nftToAuction[nftContract][tokenId] = auction;
        allAuctions.push(auction);

        // 将NFT转移到拍卖合约
        nft.transferFrom(msg.sender, auction, tokenId);

        emit AuctionCreated(
            auction,
            msg.sender,
            nftContract,
            tokenId,
            startTime,
            endTime,
            startPrice,
            paymentToken
        );
    }

    /**
     * @dev 更新手续费管理器
     */
    function setFeeManager(address newFeeManager) external onlyOwner {
        require(newFeeManager != address(0), "Invalid fee manager");
        feeManager = FeeManager(newFeeManager);
        emit FeeManagerUpdated(newFeeManager);
    }

    /**
     * @dev 更新拍卖合约实现
     */
    function setAuctionImplementation(
        address newImplementation
    ) external onlyOwner {
        require(newImplementation != address(0), "Invalid implementation");
        auctionImplementation = newImplementation;
        emit AuctionImplementationUpdated(newImplementation);
    }

    /**
     * @dev 通过NFT查询当前拍卖
     */
    function getAuctionForNFT(
        address nftContract,
        uint256 tokenId
    ) external view returns (address) {
        return nftToAuction[nftContract][tokenId];
    }

    /**
     * @dev 获取拍卖总数
     */
    function getAuctionCount() external view returns (uint256) {
        return allAuctions.length;
    }

    /**
     * @dev UUPS升级授权
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
