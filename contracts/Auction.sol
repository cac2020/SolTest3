// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {PriceConverter} from "./PriceConverter.sol";
import {FeeManager} from "./FeeManager.sol";

import "hardhat/console.sol";

/**
 * @title Auction
 * @dev 拍卖合约，支持ERC20或ETH出价，集成Chainlink预言机
 * 用 Clones.sol 实现拍卖工厂模式，模板合约Auction包含拍卖的核心逻辑，需注意：
 *  - 不能使用构造函数（克隆体无法执行构造函数），需用 initialize 函数初始化状态。
 *  - 状态变量需存储在克隆体中（代理会保留状态，模板仅提供逻辑）
 */
contract Auction is Initializable, ReentrancyGuard {
    // 拍卖状态枚举
    enum AuctionStatus {
        Active,//激活
        Ended,//结束
        Cancelled//取消
    }
    
    // 拍卖基本信息
    address public seller;       //卖方地址
    address public nftContract;  //NFT合约地址
    uint256 public tokenId;      //NFT代币ID
    uint256 public startPrice;   //起拍价格 使用ETH
    uint256 public startUsdPrice;//起拍美元价格
    uint256 public startTime;    //拍卖开始时间
    uint256 public endTime;      //拍卖结束时间
    address public paymentToken; // 0地址表示ETH  其他表示ERC20代币
    address public factory;      //拍卖工厂合约地址
    FeeManager public feeManager;//费用管理合约地址
    
    // 竞价信息
    address public highestBidder;//最高出价者
    uint256 public highestBid;   //最高出价
    uint256 public highestUsdBid;//最高出价换算的美元金额
    mapping(address => uint256) public bids;//存储竞拍者地址对应的出价或投标金额，方便快速查找和验证
    
    // 拍卖状态
    AuctionStatus public status;
    
    // Chainlink价格预言机
    mapping(address => address) public priceFeeds; // 代币地址 => 预言机
        
    // 记录用户出价，包含出价者地址、金额和美元价值
    event BidPlaced(address indexed bidder, uint256 amount, uint256 usdValue);
    // 记录拍卖结束，包含获胜者地址和最终金额
    event AuctionEnded(address indexed winner, uint256 amount);
    // 记录拍卖取消
    event AuctionCancelled();
    // 记录资金退还，包含退款用户和金额
    event FundsRefunded(address indexed bidder, uint256 amount);
    // 记录跨链收到的出价，包含出价者、金额和源链选择器
    event CrossChainBidReceived(address indexed bidder, uint256 amount, uint64 sourceChainSelector);
    
    /**
     * @dev 初始化函数
     */
    function initialize(
        address _seller,
        address _nftContract,
        uint256 _tokenId,
        uint256 _startPrice,
        uint256 _startTime,
        uint256 _endTime,
        address _paymentToken,
        address _feeManager,
        address _factory
    ) external initializer {
        
        require(_seller != address(0), "Invalid seller");
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_startPrice > 0, "Invalid start price");
        require(_endTime > _startTime, "Invalid end time");
        require(_feeManager != address(0), "Invalid fee manager");
        require(_factory != address(0), "Invalid factory");
        
        seller = _seller;
        nftContract = _nftContract;
        tokenId = _tokenId;
        startPrice = _startPrice;
        startTime = _startTime;
        endTime = _endTime;
        paymentToken = _paymentToken;
        feeManager = FeeManager(_feeManager);
        factory = _factory;
        status = AuctionStatus.Active;
    }
    
    /**
     * @dev 设置价格预言机
     * @param token 代币地址
     * @param feed 价格预言机地址
     */
    function setPriceFeed(address token, address feed) external {
        require(msg.sender == factory, "Only factory");
        require(feed != address(0), "Invalid feed");
        priceFeeds[token] = feed;
    }

    /**
     * @dev 出价（ETH）分开 
     * 注意：以防错误输入造成错误转账
     */
    function bidWithEth(address paymentToken_) external payable nonReentrant {
        require(status == AuctionStatus.Active, "Auction not active");
        require(block.timestamp < endTime, "Auction ended");
        require(paymentToken_ == address(0), "Payment token is not ETH");
        uint256 bidAmount = msg.value;
        require(bidAmount >= startPrice, "Bid below start price");

        // 计算美元价值
        uint256 usdValue = PriceConverter.getUsdValue(bidAmount, priceFeeds[address(0)]);
        require(usdValue > highestUsdBid, "Bid too low");
        console.log(4);
        
        // 记录之前的最高出价者以便退款
        address previousBidder = highestBidder;
        uint256 previousBid = highestBid;
        console.log(5);
        
        // 更新最高出价
        highestBidder = msg.sender;
        highestBid = bidAmount;
        highestUsdBid = usdValue;
        bids[msg.sender] += bidAmount;

        console.log(6);
        
        //触发用户竞拍事件
        emit BidPlaced(msg.sender, bidAmount, usdValue);

        console.log(7);
        
        // 退还之前的出价
        if (highestBid > 0 && previousBidder != address(0)){
            if (paymentToken == address(0)){
                //退还以太坊
                (bool success, ) = previousBidder.call{value: previousBid}("");
                require(success, "Refund failed");
            } else {
                //退还ERC20代币
                IERC20(paymentToken).transfer(previousBidder, previousBid);
            }
            emit FundsRefunded(previousBidder, previousBid);
        }
        paymentToken = address(0);
    }
    
    /**
     * @dev 出价（ERC20）
     * @param amount 出价金额
     */
    function bidWithERC20(uint256 amount,address paymentToken_) external nonReentrant {
        require(status == AuctionStatus.Active, "Auction not active");
        require(block.timestamp < endTime, "Auction ended");
        require(paymentToken_ != address(0), "Payment token is ETH");
        require(amount > 0, "Amount must be positive");
        
        // 转换为美元价值进行比较
        uint256 newBidUsd = PriceConverter.getUsdValue(amount, priceFeeds[paymentToken_]);
        if (startUsdPrice == 0){
            startUsdPrice = PriceConverter.getUsdValue(startPrice, priceFeeds[address(0)]);
        }        
        require(newBidUsd > startUsdPrice, "Bid below start price");
        require(newBidUsd > highestUsdBid, "Bid too low in USD");
        
        // 记录之前的最高出价者以便退款
        address previousBidder = highestBidder;
        uint256 previousBid = highestBid;
        
        // 转移代币
        IERC20 token = IERC20(paymentToken_);
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // 更新最高出价
        highestBidder = msg.sender;
        highestBid = amount;
        highestUsdBid = newBidUsd;
        bids[msg.sender] += amount;
        
        emit BidPlaced(msg.sender, amount, newBidUsd);
        
        // 退还之前的出价
         if (highestBid > 0 && previousBidder != address(0)){
            if (paymentToken == address(0)){
                //退还以太坊
                (bool success, ) = previousBidder.call{value: previousBid}("");
                require(success, "Refund failed");
            } else {
                //退还ERC20代币
                IERC20(paymentToken).transfer(previousBidder, previousBid);
            }
            emit FundsRefunded(previousBidder, previousBid);
        }
        paymentToken = paymentToken_;
    }
    
    /**
     * @dev 结束拍卖
     */
    function endAuction() external nonReentrant {
        require(status == AuctionStatus.Active, "Auction not active");
        require(block.timestamp > endTime, "Auction not ended");
        
        status = AuctionStatus.Ended;
        
        if (highestBidder != address(0)) {
            // 根据最高出价计算手续费
            (uint256 feePercentage, address feeReceiver) = feeManager.calculateFee(highestBid);
            //收费 付给收费地址
            uint256 feeAmount = (highestBid * feePercentage) / 10000; // 按万分数计算
            //给卖家最后获得拍卖价值
            uint256 sellerAmount = highestBid - feeAmount;
            
            // 转移NFT给最高出价者
            IERC721(nftContract).safeTransferFrom(seller, highestBidder, tokenId);
            
            // 转移资金给卖家和手续费接收者
            if (paymentToken == address(0)) {
                // ETH支付
                (bool sellerSuccess, ) = seller.call{value: sellerAmount}("");
                require(sellerSuccess, "Payment to seller failed");
                //支付手续费
                (bool feeSuccess, ) = feeReceiver.call{value: feeAmount}("");
                require(feeSuccess, "Payment to fee receiver failed");
            } else {
                // ERC20支付
                IERC20 token = IERC20(paymentToken);
                require(token.transfer(seller, sellerAmount), "Payment to seller failed");
                //支付手续费
                require(token.transfer(feeReceiver, feeAmount), "Payment to fee receiver failed");
            }
        } else {
            // 没有出价，将NFT返还给卖家 
            //如果只是授权 则不需要转移  只要取消授权就可以 
            IERC721(nftContract).transferFrom(address(this), seller, tokenId);
        }
        
        emit AuctionEnded(highestBidder, highestBid);
    }
    
    /**
     * @dev 接收ETH
     */
    receive() external payable {}
}
