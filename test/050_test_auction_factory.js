const { ethers, deployments, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("AuctionFactory", function () {
  let auctionFactory;
  let auctionImplementation;
  let feeManager;
  let nft;
  let priceConverter;

  let owner, seller, bidder1, bidder2, feeReceiver;
  let factoryAddress;
  let feeManagerAddress;
  let nftAddress;
  let auctionImplementationAddress;
  let priceConverterAddress;

  const TOKEN_ID = 0;
  const DURATION = 3601; // 略大于3600秒
  const START_PRICE = ethers.parseEther("1");
  const DECIMALS = 8;
  const START_USD_PRICE = 300000000000; // 3000 USD with 8 decimals

  beforeEach(async () => {
    // 获取测试账户
    [owner, seller, bidder1, bidder2, feeReceiver] = await ethers.getSigners();

    // 部署Mock Chainlink Price Feed
    const MockV3Aggregator = await ethers.getContractFactory(
      "MockV3Aggregator"
    );
    const priceFeed = await MockV3Aggregator.deploy(DECIMALS, START_USD_PRICE);
    await priceFeed.waitForDeployment();

    // 部署PriceConverter库
    const PriceConverterFactory = await ethers.getContractFactory(
      "PriceConverter"
    );
    priceConverter = await PriceConverterFactory.deploy();
    await priceConverter.waitForDeployment();
    priceConverterAddress = await priceConverter.getAddress();

    // 部署FeeManager
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy();
    await feeManager.waitForDeployment();
    feeManagerAddress = await feeManager.getAddress();

    // 部署MyNFT
    const MyNFT = await ethers.getContractFactory("MyNFT");
    // 使用 deployProxy 方法部署可升级的NFT合约
    nft = await upgrades.deployProxy(
      MyNFT,
      [owner.address], // 构造函数参数：初始所有者
      {
        initializer: "initialize",
        kind: "uups",
      }
    );
    await nft.waitForDeployment();
    nftAddress = await nft.getAddress();

    // 部署Auction实现合约
    const Auction = await ethers.getContractFactory("Auction", {
      libraries: {
        PriceConverter: priceConverterAddress,
      },
    });
    auctionImplementation = await Auction.deploy();
    await auctionImplementation.waitForDeployment();
    auctionImplementationAddress = await auctionImplementation.getAddress();

    // 部署AuctionFactory
    //const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    //auctionFactory = await AuctionFactory.deploy();
    //await auctionFactory.waitForDeployment();
    //factoryAddress = await auctionFactory.getAddress();

    // await deployments.fixture(["all"]);
    // const AuctionFactory = await deployments.get("AuctionFactory");
    // auctionFactory = await ethers.getContractAt(
    //   "AuctionFactory",
    //   AuctionFactory.address
    // );
    // factoryAddress = AuctionFactory.address;

    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    // 使用 deployProxy 方法部署可升级的工厂合约
    auctionFactory = await upgrades.deployProxy(
      AuctionFactory,
      [owner.address, feeManagerAddress, auctionImplementationAddress], // 构造函数参数：模板合约地址
      {
        initializer: "initialize", //指定初始化函数的名称
        redeployImplementation: "onchange", //控制是否重新部署逻辑合约：- always：每次部署都重新部署逻辑合约；- never：从不重新部署（复用已部署的）；- onchange：逻辑合约代码变化时才重新部署（默认）
        kind: "uups", //指定代理模式：- uups：UUPS 代理（逻辑合约自身控制升级）；- transparent：透明代理（独立管理员控制升级）。
      }
    );
    await auctionFactory.waitForDeployment();
    factoryAddress = await auctionFactory.getAddress();

    // 铸造NFT并授权给工厂
    await nft.safeMint(seller.address);
    await nft.connect(seller).setApprovalForAll(factoryAddress, true);

    // 为竞拍者提供一些ETH余额
    await bidder1.sendTransaction({
      to: bidder2.address,
      value: ethers.parseEther("10"),
    });
  });

  describe("Initialization", async () => {
    it("应该正确初始化工厂合约", async () => {
      const fm = await auctionFactory.feeManager();
      const ai = await auctionFactory.auctionImplementation();
      //expect(fm.address).to.equal(feeManagerAddress);
      expect(ai).to.equal(auctionImplementationAddress);
    });

    it.skip("应该拒绝使用无效参数初始化", async () => {
      //可升级合约 要改变参数 得使用deployProxy
      const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
      const newFactory = await AuctionFactory.deploy();
      await newFactory.waitForDeployment();

      await expect(
        newFactory.initialize(
          owner.address,
          ethers.ZeroAddress,
          auctionImplementationAddress
        )
      ).to.be.revertedWithCustomError(newFactory, "InvalidInitialization"); //
      //revertedWith("Invalid fee manager");//InvalidInitialization

      await expect(
        newFactory.initialize(
          owner.address,
          feeManagerAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(newFactory, "InvalidInitialization");
    });

    it("应该防止重复初始化", async function () {
      await expect(
        auctionFactory.initialize(
          owner.address,
          feeManagerAddress,
          auctionImplementationAddress
        )
      ).to.be.revertedWithCustomError(auctionFactory, "InvalidInitialization");
    });
  });

  describe("Create Auction", function () {
    it("应该允许NFT所有者创建拍卖", async function () {
      const tx = await auctionFactory.connect(seller).createAuction(
        nftAddress,
        TOKEN_ID,
        DURATION,
        START_PRICE,
        ethers.ZeroAddress // ETH支付
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "AuctionCreated"
      );

      expect(event).to.exist;
      const auctionAddress = event.args.auction;

      // 验证拍卖信息
      expect(
        await auctionFactory.getAuctionForNFT(nftAddress, TOKEN_ID)
      ).to.equal(auctionAddress);
      expect(await auctionFactory.getAuctionCount()).to.equal(1);

      // 验证NFT已转移
      const auction = await ethers.getContractAt("Auction", auctionAddress);
      expect(await nft.ownerOf(TOKEN_ID)).to.equal(auctionAddress);

      // 验证拍卖参数
      expect(await auction.seller()).to.equal(seller.address);
      expect(await auction.nftContract()).to.equal(nftAddress);
      expect(await auction.tokenId()).to.equal(TOKEN_ID);

      // 无效起拍价
      await expect(
        auctionFactory
          .connect(seller)
          .createAuction(nftAddress, TOKEN_ID, DURATION, 0, ethers.ZeroAddress)
      ).to.be.revertedWith("Start price must be positive");
    });

    it("应该拒绝已存在的NFT拍卖", async function () {
      // 创建第一个拍卖
      await auctionFactory
        .connect(seller)
        .createAuction(
          nftAddress,
          TOKEN_ID,
          DURATION,
          START_PRICE,
          ethers.ZeroAddress
        );

      // 尝试为同一NFT创建第二个拍卖
      await expect(
        auctionFactory
          .connect(seller)
          .createAuction(
            nftAddress,
            TOKEN_ID,
            DURATION,
            START_PRICE,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("NFT already in auction");
    });
  });

  describe("Update Functions", function () {
    it("应该允许所有者更新手续费管理器", async function () {
      const newFeeManager = await (
        await ethers.getContractFactory("FeeManager")
      ).deploy();
      await newFeeManager.waitForDeployment();
      const newFeeManagerAddress = await newFeeManager.getAddress();

      await expect(
        auctionFactory.connect(owner).setFeeManager(newFeeManagerAddress)
      )
        .to.emit(auctionFactory, "FeeManagerUpdated")
        .withArgs(newFeeManagerAddress);

      expect(await auctionFactory.feeManager()).to.equal(newFeeManagerAddress);
    });

    it("应该拒绝非所有者更新手续费管理器", async function () {
      const newFeeManager = await (
        await ethers.getContractFactory("FeeManager")
      ).deploy();
      await newFeeManager.waitForDeployment();
      const newFeeManagerAddress = await newFeeManager.getAddress();

      await expect(
        auctionFactory.connect(bidder1).setFeeManager(newFeeManagerAddress)
      )
        .to.be.revertedWithCustomError(
          auctionFactory,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(bidder1.address);
    });

    it("应该拒绝使用无效地址更新手续费管理器", async function () {
      await expect(
        auctionFactory.connect(owner).setFeeManager(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid fee manager");
    });

    it("应该允许所有者更新拍卖实现合约", async function () {
      const NewAuction = await ethers.getContractFactory("Auction", {
        libraries: {
          PriceConverter: priceConverterAddress,
        },
      });
      const newAuctionImplementation = await NewAuction.deploy();
      await newAuctionImplementation.waitForDeployment();
      const newAuctionImplementationAddress =
        await newAuctionImplementation.getAddress();

      await expect(
        auctionFactory
          .connect(owner)
          .setAuctionImplementation(newAuctionImplementationAddress)
      )
        .to.emit(auctionFactory, "AuctionImplementationUpdated")
        .withArgs(newAuctionImplementationAddress);

      expect(await auctionFactory.auctionImplementation()).to.equal(
        newAuctionImplementationAddress
      );
    });

    it("应该拒绝非所有者更新拍卖实现合约", async function () {
      const NewAuction = await ethers.getContractFactory("Auction", {
        libraries: {
          PriceConverter: priceConverterAddress,
        },
      });
      const newAuctionImplementation = await NewAuction.deploy();
      await newAuctionImplementation.waitForDeployment();
      const newAuctionImplementationAddress =
        await newAuctionImplementation.getAddress();

      await expect(
        auctionFactory
          .connect(bidder1)
          .setAuctionImplementation(newAuctionImplementationAddress)
      )
        .to.be.revertedWithCustomError(
          auctionFactory,
          "OwnableUnauthorizedAccount"
        )
        .withArgs(bidder1.address);
    });

    it("应该拒绝使用无效地址更新拍卖实现合约", async function () {
      await expect(
        auctionFactory
          .connect(owner)
          .setAuctionImplementation(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid implementation");
    });
  });

  describe("View Functions", function () {
    it("应该正确返回NFT对应的拍卖", async function () {
      // 创建拍卖前查询
      expect(
        await auctionFactory.getAuctionForNFT(nftAddress, TOKEN_ID)
      ).to.equal(ethers.ZeroAddress);

      // 创建拍卖
      const tx = await auctionFactory
        .connect(seller)
        .createAuction(
          nftAddress,
          TOKEN_ID,
          DURATION,
          START_PRICE,
          ethers.ZeroAddress
        );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "AuctionCreated"
      );
      const auctionAddress = event.args.auction;

      // 创建拍卖后查询
      expect(
        await auctionFactory.getAuctionForNFT(nftAddress, TOKEN_ID)
      ).to.equal(auctionAddress);
    });

    it("应该正确返回拍卖总数", async function () {
      expect(await auctionFactory.getAuctionCount()).to.equal(0);

      // 创建第一个拍卖
      await auctionFactory
        .connect(seller)
        .createAuction(
          nftAddress,
          TOKEN_ID,
          DURATION,
          START_PRICE,
          ethers.ZeroAddress
        );
      expect(await auctionFactory.getAuctionCount()).to.equal(1);

      // 为另一个NFT创建第二个拍卖
      await nft.safeMint(seller.address);
      await auctionFactory.connect(seller).createAuction(
        nftAddress,
        1, // 新的tokenId
        DURATION,
        START_PRICE,
        ethers.ZeroAddress
      );
      expect(await auctionFactory.getAuctionCount()).to.equal(2);
    });
  });

  describe("Upgradeability", function () {
    it.skip("应该允许所有者升级合约", async function () {
      // 部署新的实现合约
      const NewAuctionFactory = await ethers.getContractFactory(
        "AuctionFactory"
      );
      const newImplementation = await NewAuctionFactory.deploy();
      await newImplementation.waitForDeployment();
      const newImplementationAddress = await newImplementation.getAddress();

      // 升级合约
      await auctionFactory.connect(owner).upgradeTo(newImplementationAddress);

      // 验证升级成功
      const implementationSlot =
        "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const implementation = await ethers.provider.getStorageAt(
        auctionFactory.getAddress(),
        implementationSlot
      );
      expect(ethers.getAddress("0x" + implementation.substring(26))).to.equal(
        newImplementationAddress
      );
    });

    it.skip("应该拒绝非所有者升级合约", async function () {
      const NewAuctionFactory = await ethers.getContractFactory(
        "AuctionFactory"
      );
      const newImplementation = await NewAuctionFactory.deploy();
      await newImplementation.waitForDeployment();
      const newImplementationAddress = await newImplementation.getAddress();

      await expect(
        auctionFactory.connect(bidder1).upgradeTo(newImplementationAddress)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
