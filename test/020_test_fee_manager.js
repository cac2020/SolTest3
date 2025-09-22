const { ethers, upgrades, getNamedAccounts } = require("hardhat");
const { expect } = require("chai");

describe("FeeManager", async () => {
  let feeManager;
  let owner, user1;

  const BASE_FEE_RATE = 200; // 2% in basis points

  beforeEach(async () => {
    //获取账户
    //调用hardhat-deploy方法 getNamedAccounts() 获取的是账户地址字符串 ，不能连接合约调用
    // const signers = await ethers.getSigners(); 获取是签名账户  可以用于连接合约调用
    //const { deployer, user1, user2 } = await getNamedAccounts();
    //const namedAccounts = await getNamedAccounts();
    //owner = namedAccounts.deployer;
    //user1 = namedAccounts.user1;

    // 获取签名者对象，用于发送交易
    const signers = await ethers.getSigners();
    owner = signers[0]; 
    user1 = signers[1];

    /**
     * 自动部署
     * fixture是 hardhat-deploy 插件提供的核心测试工具，用于在测试前自动执行部署脚本，快速初始化测试环境，避免在测试代码中重复编写合约部署逻辑。
     * 1）自动执行部署脚本：自动运行 deploy 目录下的部署脚本，将合约部署到测试网络（如 Hardhat 本地网络），无需在测试中手动调用 deploy 函数。
     * 2）缓存部署结果：首次调用 fixture 时执行部署，后续调用会直接复用缓存的部署结果（合约地址、ABI 等），大幅提升测试速度（尤其在多个测试用例共享部署状态时）。
     * 3）支持按标签过滤部署：可通过标签（tags）指定只执行特定部署脚本（例如只部署 token 相关合约，忽略其他脚本），灵活控制测试环境的初始化范围。
     *  await deployments.fixture(); // 无参时 执行所有部署脚本
     *  await deployments.fixture(["token"]); //按照tag标签过滤执行部署脚本
     */
    //fixture不能传递参数  所以测试时一些初始测试数据要使用部署时预置的数据
    await deployments.fixture(["deployFeeManager"]);
    //deployments.get("xxx") 返回的是一个包含合约地址和ABI等信息的部署对象，而不是可以直接调用方法的合约实例。
    const FeeManagerProxy = await deployments.get("FeeManagerProxy");
    //获取代理合约两种方法：
    //方法一：通过已知实现合约名称和代理合约地址获取合约实例 ：第一个参数是实现合约名称 可以从编译产物找到ABI，第二个参数是代理合约地址
    feeManager = await ethers.getContractAt(
      "FeeManager",
      FeeManagerProxy.address
    );

    //方法二： attach
    //获取实现合约工厂对象
    //const FeeManager = await ethers.getContractFactory("FeeManager");
    //创建一个新的合约实例，该实例的所有方法调用都会发送到指定的 address，并使用当前合约工厂的 ABI 解析方法。
    //feeManager = FeeManager.attach(FeeManagerProxy.address);
  });

  describe("Initialization", async () => {
    //校验两个初始化参数
    it("should initialize with correct values", async () => {
      //public变量 可以通过 xx()获取
      expect(await feeManager.baseFeeRate()).to.equal(BASE_FEE_RATE);
      expect(await feeManager.feeReceiver()).to.equal(owner.address);
    });

    //校验initialize初始化方法里费率
    it("should fail to initialize with rate too high", async () => {
      //重新部署 触发initialize里的校验逻辑
      const FeeManager = await ethers.getContractFactory("FeeManager");
      await expect(
        upgrades.deployProxy(
          FeeManager,
          [owner.address, 10001, owner.address], // 100.01% - too high
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Rate too high");
    });

    //校验initialize初始化方法里手续费接收人地址
    it("should fail to initialize with zero address receiver", async () => {
      const FeeManager = await ethers.getContractFactory("FeeManager");
      await expect(
        upgrades.deployProxy(
          FeeManager,
          [owner.address, BASE_FEE_RATE, ethers.ZeroAddress],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("Invalid receiver");
    });
  });

  describe("setTieredRate", function () {
    //设置费率触发事件校验 并校验添加和查询费率 阈值相同
    it("should allow owner to set tiered rate", async () => {
      const threshold = ethers.parseEther("1");
      const rate = 500; // 5%
      await expect(feeManager.setTieredRate(threshold, rate))
        .to.emit(feeManager, "TieredRateUpdated")
        .withArgs(threshold, rate);
      const [storedThreshold, storedRate] = await feeManager.getTieredRate(0);
      expect(storedThreshold).to.equal(threshold);
      expect(storedRate).to.equal(rate);
    });

    //非所有者调用权限校验
    it("should fail when non-owner tries to set tiered rate", async () => {
      const feeManagerAsUser = feeManager.connect(user1);
      await expect(feeManagerAsUser.setTieredRate(ethers.parseEther("1"), 500))
        .to.be.revertedWithCustomError(feeManager, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    //设置费率时 校验费率过高限制
    it("should fail when rate is too high", async () => {
      await expect(
        feeManager.setTieredRate(ethers.parseEther("1"), 10001) // 100.01% - too high
      ).to.be.revertedWith("Rate too high");
    });

    //更新同一阈值费率
    it("should update existing tiered rate", async () => {
      const threshold = ethers.parseEther("1");
      const initialRate = 500;
      const updatedRate = 750;

      // Set initial rate
      await feeManager.setTieredRate(threshold, initialRate);
      let [storedThreshold, storedRate] = await feeManager.getTieredRate(0);
      expect(storedRate).to.equal(initialRate);

      // Update rate
      await feeManager.setTieredRate(threshold, updatedRate);
      [storedThreshold, storedRate] = await feeManager.getTieredRate(0);
      expect(storedRate).to.equal(updatedRate);
    });

    //添加多个阈值 费率  再取出来挨个比对校验
    it("should maintain sorted order when adding multiple tiered rates", async () => {
      // Add rates in random order
      await feeManager.setTieredRate(ethers.parseEther("10"), 300);
      await feeManager.setTieredRate(ethers.parseEther("1"), 500);
      await feeManager.setTieredRate(ethers.parseEther("5"), 400);

      // Check that they are stored in sorted order
      const [threshold1, rate1] = await feeManager.getTieredRate(0);
      const [threshold2, rate2] = await feeManager.getTieredRate(1);
      const [threshold3, rate3] = await feeManager.getTieredRate(2);

      expect(threshold1).to.equal(ethers.parseEther("1"));
      expect(threshold2).to.equal(ethers.parseEther("5"));
      expect(threshold3).to.equal(ethers.parseEther("10"));

      expect(rate1).to.equal(500);
      expect(rate2).to.equal(400);
      expect(rate3).to.equal(300);
    });
  });

  describe("getTieredRate", function () {
    //校验查询费率与添加值相等
    it("should return correct tiered rate", async () => {
      const threshold = ethers.parseEther("1");
      const rate = 500;

      await feeManager.setTieredRate(threshold, rate);
      const [storedThreshold, storedRate] = await feeManager.getTieredRate(0);

      expect(storedThreshold).to.equal(threshold);
      expect(storedRate).to.equal(rate);
    });

    //没有数据就查询第0个元素报错校验
    it("should fail when index is out of bounds", async () => {
      await expect(feeManager.getTieredRate(0)).to.be.revertedWith(
        "Index out of bounds"
      );
    });
  });

  describe("setFeeReceiver", function () {
    //设置收费接收人
    it("should allow owner to update fee receiver", async () => {
      const newReceiver = "0x0000000000000000000000000000000000000002";
      //触发事件
      await expect(feeManager.setFeeReceiver(newReceiver))
        .to.emit(feeManager, "FeeReceiverUpdated")
        .withArgs(newReceiver);
      //校验查询值等于设置值
      expect(await feeManager.feeReceiver()).to.equal(newReceiver);
    });

    //非所有者调用权限校验
    it("should fail when non-owner tries to update fee receiver", async () => {
      const feeManagerAsUser = feeManager.connect(user1);
      const newReceiver = "0x0000000000000000000000000000000000000002";

      await expect(feeManagerAsUser.setFeeReceiver(newReceiver))
        .to.be.revertedWithCustomError(feeManager, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    //设置收费接收人地址为0
    it("should fail when trying to set zero address as receiver", async () => {
      await expect(
        feeManager.setFeeReceiver(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid receiver");
    });
  });

  describe("Fee calculation with multiple tiers", function () {
    beforeEach(async () => {
      // Set up multiple tiered rates
      await feeManager.setTieredRate(ethers.parseEther("1"), 500); // 5% for >= 1 ETH
      await feeManager.setTieredRate(ethers.parseEther("5"), 400); // 4% for >= 5 ETH
      await feeManager.setTieredRate(ethers.parseEther("10"), 300); // 3% for >= 10 ETH
    });

    it("should use correct tier based on amount", async () => {
      // Test amount below first tier 取默认值 BASE_FEE_RATE
      let [rate] = await feeManager.calculateFee(ethers.parseEther("0.5"));
      expect(rate).to.equal(BASE_FEE_RATE); // Should use base rate

      // Test amount in first tier
      [rate] = await feeManager.calculateFee(ethers.parseEther("1"));
      expect(rate).to.equal(500); // 5%

      // Test amount in second tier
      [rate] = await feeManager.calculateFee(ethers.parseEther("5"));
      expect(rate).to.equal(400); // 4%

      // Test amount in third tier
      [rate] = await feeManager.calculateFee(ethers.parseEther("10"));
      expect(rate).to.equal(300); // 3%

      // Test amount above highest tier
      [rate] = await feeManager.calculateFee(ethers.parseEther("20"));
      expect(rate).to.equal(300); // Should use highest tier rate
    });
  });
});
