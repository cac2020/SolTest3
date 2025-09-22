const { ethers, deployments } = require("hardhat");
const { expect } = require("chai");

describe("Auction", async () => {
  let auction;
  let nft;
  let erc20Token;
  let feeManager;
  let priceFeedAddress;

  let owner, seller, bidder1, bidder2, feeReceiver;
  let auctionAddress;
  let erc20TokenAddress;
  let nftAddress;
  let feeManagerAddress;
  let PriceConverterAddress;

  const TOKEN_ID = 0;
  const START_PRICE = ethers.parseEther("1"); // 1 ETH
  const DECIMALS = 8;
  const START_USD_PRICE = 300000000000;
  const START_TIME = Math.floor(Date.now() / 1000); //当前时间
  const END_TIME = Math.floor(Date.now() / 1000) + 60; //当前时间+60s

  beforeEach(async () => {
    // 获取测试账户
    [owner, seller, addr1, bidder1, bidder2, feeReceiver] =
      await ethers.getSigners();
    initialOwner = owner.address;

    // 部署Mock Chainlink Price Feed
    // 需要在合约内 冗余引入  否则没有编译物  这里就取不到 import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/shared/mocks/MockV3Aggregator.sol";
    const MockV3Aggregator = await ethers.getContractFactory(
      "MockV3Aggregator"
    );
    priceFeed = await MockV3Aggregator.deploy(DECIMALS, START_USD_PRICE); // 8 decimals, 3000 USD
    await priceFeed.waitForDeployment();
    priceFeedAddress = await priceFeed.getAddress();

    //OpenZeppelin提供了标准的ERC20实现，可以直接用于测试：
    const MyToken = await ethers.getContractFactory("MyToken");
    erc20Token = await MyToken.deploy(initialOwner); // 8 decimals, 3000 USD
    await erc20Token.waitForDeployment();
    await erc20Token.mint(initialOwner, 100000);
    erc20TokenAddress = await erc20Token.getAddress();

    // 部署Auction合约
    //依赖多个部署时都要加载进来
    await deployments.fixture([
      "deployPriceConverter",
      "deployFeeManager",
      "deployMyNFT",
      "Auction",
    ]);
    //feeManager
    const FeeManagerProxy = await deployments.get("FeeManagerProxy");
    feeManager = await ethers.getContractAt(
      "FeeManager",
      FeeManagerProxy.address
    );
    feeManagerAddress = FeeManagerProxy.address;
    //MyNFT
    const MyNFTProxy = await deployments.get("MyNFTProxy");
    nft = await ethers.getContractAt("MyNFT", MyNFTProxy.address);
    nftAddress = MyNFTProxy.address;
    //Auction
    //const Auction = await deployments.get("Auction");
    //auction = await ethers.getContractAt("Auction", Auction.address);
    //auctionAddress = Auction.address;

    const PriceConverterFactory = await ethers.getContractFactory(
      "PriceConverter"
    );
    const PriceConverter = await PriceConverterFactory.deploy();
    await PriceConverter.waitForDeployment();
    PriceConverterAddress = await PriceConverter.getAddress();
    const Auction = await ethers.getContractFactory("Auction", {
      libraries: {
        PriceConverter: PriceConverterAddress,
      },
    });
    auction = await Auction.deploy();
    await auction.waitForDeployment();
    auctionAddress = await auction.getAddress();

    // 初始化拍卖
    await auction.initialize(
      seller.address,
      await nft.getAddress(),
      TOKEN_ID,
      START_PRICE,
      START_TIME,
      END_TIME,
      ethers.ZeroAddress, // 初始使用ETH支付
      await feeManager.getAddress(),
      initialOwner // factory
    );

    // 设置价格预言机
    await auction.setPriceFeed(ethers.ZeroAddress, priceFeedAddress);
    await auction.setPriceFeed(erc20TokenAddress, priceFeedAddress);

    // 铸造NFT并转移给拍卖合约
    await nft.safeMint(seller.address);
    await nft
      .connect(seller)
      .transferFrom(seller.address, auctionAddress, TOKEN_ID);

    // 给竞拍者一些ERC20代币
    await erc20Token.transfer(bidder1.address, 100);
    await erc20Token.transfer(bidder2.address, 100);
  });

  //初始化测试分组
  describe("Initialization", async () => {
    it("应该正确初始化拍卖参数", async () => {
      expect(await auction.seller()).to.equal(seller.address);
      expect(await auction.nftContract()).to.equal(nftAddress);
      expect(await auction.tokenId()).to.equal(TOKEN_ID);
      expect(await auction.startPrice()).to.equal(START_PRICE);
      expect(await auction.startTime()).to.equal(START_TIME);
      expect(await auction.endTime()).to.equal(END_TIME);
      expect(await auction.status()).to.equal(0); // Active
    });

    it("应该拒绝无效的初始化参数", async () => {
      const Auction = await ethers.getContractFactory("Auction", {
        libraries: {
          PriceConverter: PriceConverterAddress,
        },
      });
      const newAuction = await Auction.deploy();
      await newAuction.waitForDeployment();

      // 测试无效的卖家地址
      await expect(
        newAuction.initialize(
          ethers.ZeroAddress,
          nftAddress,
          TOKEN_ID,
          START_PRICE,
          START_TIME,
          END_TIME,
          ethers.ZeroAddress,
          feeManagerAddress,
          initialOwner
        )
      ).to.be.revertedWith("Invalid seller");

      // 测试无效的NFT合约地址
      await expect(
        newAuction.initialize(
          seller.address,
          ethers.ZeroAddress,
          TOKEN_ID,
          START_PRICE,
          START_TIME,
          END_TIME,
          ethers.ZeroAddress,
          feeManagerAddress,
          initialOwner
        )
      ).to.be.revertedWith("Invalid NFT contract");
    });
  });

  //ETF出价测试组
  describe("Bidding with ETH", function () {
    it.skip("应该允许用户用ETH出价", async function () {
      const bidAmount = ethers.parseEther("2"); // 2 ETH
      await expect(
        auction
          .connect(bidder1)
          .bidWithEth(ethers.ZeroAddress, { value: bidAmount })
      )
        .to.emit(auction, "BidPlaced")
        .withArgs(bidder1.address, bidAmount, 6000e8); // 2 ETH * 3000 USD/ETH = 6000 USD
      expect(await auction.highestBidder()).to.equal(bidder1.address);
      expect(await auction.highestBid()).to.equal(bidAmount);
      expect(await auction.bids(bidder1.address)).to.equal(bidAmount);
    });

    it.skip("应该拒绝低于起拍价的出价", async function () {
      const lowBid = ethers.parseEther("0.5"); // 低于起拍价
      await expect(
        auction
          .connect(bidder1)
          .bidWithEth(ethers.ZeroAddress, { value: lowBid })
      ).to.be.revertedWith("Bid below start price");
    });

    it.skip("应该拒绝非ETH支付的ETH出价调用", async function () {
      await expect(
        auction.connect(bidder1).bidWithEth(await erc20Token.getAddress(), {
          value: ethers.parseEther("2"),
        })
      ).to.be.revertedWith("Payment token is not ETH");
    });

    it.skip("应该自动退还较低的出价", async function () {
      // 第一个出价
      const firstBid = ethers.parseEther("2");
      await auction
        .connect(bidder1)
        .bidWithEth(ethers.ZeroAddress, { value: firstBid });

      // 第二个更高的出价
      const secondBid = ethers.parseEther("3");
      const bidder1BalanceBefore = await ethers.provider.getBalance(
        bidder1.address
      );

      await auction
        .connect(bidder2)
        .bidWithEth(ethers.ZeroAddress, { value: secondBid });

      // 检查第一个出价者是否收到退款
      const bidder1BalanceAfter = await ethers.provider.getBalance(
        bidder1.address
      );
      expect(bidder1BalanceAfter).to.be.gt(bidder1BalanceBefore); // 应该收到退款

      expect(await auction.highestBidder()).to.equal(bidder2.address);
      expect(await auction.highestBid()).to.equal(secondBid);
    });
  });

  describe("Bidding with ERC20", function () {
    it.skip("应该允许用户用ERC20代币出价", async function () {
      const bidAmount = ethers.parseEther("2");
      const tokenAddress = await erc20Token.getAddress();

      // 授权拍卖合约使用代币
      await erc20Token.connect(bidder1).approve(auctionAddress, bidAmount);

      await expect(
        auction.connect(bidder1).bidWithERC20(bidAmount, tokenAddress)
      )
        .to.emit(auction, "BidPlaced")
        .withArgs(bidder1.address, bidAmount, 6000e8); // 2 tokens * 3000 USD/token = 6000 USD

      expect(await auction.highestBidder()).to.equal(bidder1.address);
      expect(await auction.highestBid()).to.equal(bidAmount);
      expect(await auction.bids(bidder1.address)).to.equal(bidAmount);
    });

    it.skip("应该拒绝ETH地址的ERC20出价调用", async function () {
      await expect(
        auction
          .connect(bidder1)
          .bidWithERC20(ethers.parseEther("2"), ethers.ZeroAddress)
      ).to.be.revertedWith("Payment token is ETH");
    });

    it.skip("应该自动退还较低的ERC20出价", async function () {
      const tokenAddress = await erc20Token.getAddress();

      // 第一个出价
      const firstBid = ethers.parseEther("2");
      await erc20Token.connect(bidder1).approve(auctionAddress, firstBid);
      await auction.connect(bidder1).bidWithERC20(firstBid, tokenAddress);

      // 第二个更高的出价
      const secondBid = ethers.parseEther("3");
      await erc20Token.connect(bidder2).approve(auctionAddress, secondBid);
      await auction.connect(bidder2).bidWithERC20(secondBid, tokenAddress);

      expect(await auction.highestBidder()).to.equal(bidder2.address);
      expect(await auction.highestBid()).to.equal(secondBid);
    });
  });

  describe("Ending Auction", function () {
    it.skip("应该在拍卖结束后正确分配资产", async function () {
      await feeManager.setFee(100, feeReceiver.address); // 1% (100/ auction.connect(bidder10000)

      const sellerBalanceBefore = await ethers.provider.getBalance(
        seller.address
      );
      const feeReceiverBalanceBefore = await ethers.provider.getBalance(
        feeReceiver.address
      );

      await expect(auction.endAuction())
        .to.emit(auction, "AuctionEnded")
        .withArgs(bidder1.address, bidAmount);

      // 检查NFT是否转移给获胜者
      expect(await nft.ownerOf(TOKEN_ID)).to.equal(bidder1.address);

      // 检查资金分配
      const sellerBalanceAfter = await ethers.provider.getBalance(
        seller.address
      );
      const feeReceiverBalanceAfter = await ethers.provider.getBalance(
        feeReceiver.address
      );

      // 卖家应该收到 2 ETH - 0.02 ETH (手续费) = 1.98 ETH
      expect(sellerBalanceAfter - sellerBalanceBefore).to.be.closeTo(
        ethers.parseEther("1.98"),
        ethers.parseEther("0.01") // 允许一些gas费用误差
      );

      // 手续费接收者应该收到 0.02 ETH
      expect(feeReceiverBalanceAfter - feeReceiverBalanceBefore).to.be.closeTo(
        ethers.parseEther("0.02"),
        ethers.parseEther("0.01")
      );
    });

    it("应该在没有出价时将NFT返还给卖家", async function () {
      // 推进时间到拍卖结束
      await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
      await ethers.provider.send("evm_mine");

      await auction.endAuction();

      // NFT应该返还给卖家
      expect(await nft.ownerOf(TOKEN_ID)).to.equal(seller.address);
    });

    it("应该拒绝在拍卖未结束时结束拍卖", async function () {
      await expect(auction.endAuction()).to.be.revertedWith(
        "Auction not ended"
      );
    });
  });

  describe("Edge Cases", function () {
    it("应该拒绝在非活跃状态下的出价", async function () {
      // 推进时间并结束拍卖
      await ethers.provider.send("evm_setNextBlockTimestamp", [END_TIME + 1]);
      await ethers.provider.send("evm_mine");
      await auction.endAuction();

      // 尝试在已结束的拍卖中出价
      await expect(
        auction
          .connect(bidder1)
          .bidWithEth(ethers.ZeroAddress, { value: ethers.parseEther("2") })
      ).to.be.revertedWith("Auction not active");
    });

    it("应该拒绝非工厂地址设置价格预言机", async function () {
      await expect(
        auction
          .connect(bidder1)
          .setPriceFeed(ethers.ZeroAddress, await priceFeed.getAddress())
      ).to.be.revertedWith("Only factory");
    });
  });
});
