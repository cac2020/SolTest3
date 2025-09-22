const { ethers, deployments } = require("hardhat");
const { expect } = require("chai");

/**
 * @dev 测试 PriceConverter 合约
 * Library 不能直接测试，可以通过 间接方式（借助 “测试辅助合约” 或 “调用合约”）测试其功能。
 * 核心原因是 Library 的设计特性 —— 它是 “代码复用模块”，不能单独部署到链上，必须依附于其他合约（普通合约、测试合约）才能执行其函数。
 * 这里我们写一个测试合约来调用 PriceConverter 的函数，并验证其返回结果。
 */
describe("PriceConverter", async () => {
  let contract, mockAggregator;
  let mockAddress;
  const DECIMALS = 8; // Chainlink price feed decimals
  const INITIAL_PRICE = 200000000000; // $2000 with 8 decimals

  beforeEach(async () => {
    /**
     * MockV3Aggregator 是一个 模拟 Chainlink(依赖包：@chainlink/contracts) 价格聚合器的合约，主要用于 本地测试或开发环境
     * - 手动设置测试价格（如将 ETH 价格固定为 3000 USD）；
     * - 模拟价格更新（如模拟价格上涨 / 下跌）；
     * - 实现 AggregatorV3Interface 的所有核心方法（如 latestRoundData），确保测试环境与生产环境的接口兼容。
     */
    //部署chainlink Mock 这里直接使用ethers里的部署方式
    const MockV3Aggregator = await ethers.getContractFactory(
      "MockV3Aggregator"
    );
    mockAggregator = await MockV3Aggregator.deploy(DECIMALS, INITIAL_PRICE);
    await mockAggregator.waitForDeployment();
    mockAddress = await mockAggregator.getAddress();

    //内联的library不能直接测试 因为会直接嵌入到引用合约里
    //部署测试合约 这里直接使用ethers里的部署方式
    // const PriceConverterTest = await ethers.getContractFactory(
    //   "PriceConverterTest",
    //   {
    //     libraries: {
    //       PriceConverter: PriceConverter.address,
    //     },
    //   }
    // );
    // contract = await PriceConverterTest.deploy();
    // await contract.waitForDeployment();
    //console.log("PriceConverterTest address:", await contract.getAddress());

    //单独部署的library 则可以直接测试  只有第一次调用成功，后面测试用例都报错：Error: Transaction reverted: library was called directly
    //await deployments.fixture(["deployPriceConverter"]);
    //const PriceConverter = await deployments.get("PriceConverter");
    //contract = await ethers.getContractAt("PriceConverter", PriceConverter.address);

    // 部署库合约（仅 external/public 库需要）
    const PriceConverter = await ethers.getContractFactory("PriceConverter");
    contract = await PriceConverter.deploy();
    await contract.waitForDeployment();
    //console.log("PriceConverter address:", await contract.getAddress());

  });
  /*
  describe("getLatestPrice", async () => {
    it("测试价格是否为0时回滚", async () => {
      await mockAggregator.updateAnswer(0);
      //const result = await contract.testPrice(mockAddress);
      //expect(result).to.equal(false); // 预期调用失败

      await expect(
        contract.testPrice(mockAddress) // 要测试的调用
    ).to.be.revertedWithCustomError(
        contract, // 合约实例（此处是 SimpleTest/PriceConverterTest 实例）
        "InvalidPrice" // 预期的自定义错误名称（与合约中定义完全一致）
    );
    });

    it("should return the latest price from the aggregator", async () => {
      const price = await contract.getLatestPrice(mockAddress);
      expect(price).to.equal(INITIAL_PRICE);
    });

    it("should revert if price is zero", async () => {
      //调用updateAnswer方法，传入参数0来更新聚合器的答案值
      await mockAggregator.updateAnswer(0);
      await expect(
        contract.getLatestPrice(mockAddress)
      ).to.be.revertedWithCustomError(contract, "InvalidPrice");
    });

    it("should revert if price is negative", async () => {
      await mockAggregator.updateAnswer(-100000000);
      await expect(
        contract.getLatestPrice(mockAddress)
      ).to.be.revertedWithCustomError(contract, "InvalidPrice");
    });

    it("should revert if updatedAt is zero (incomplete round)", async () => {
      // Simulate incomplete round by updating with zero timestamp
      //调用updateRoundData方法，传四个参数：
      // -roundId:轮次ID，表示价格数据的轮次标识符，用于区分不同的价格更新轮次
      // -answer:价格答案，表示实际的价格数值，例如 INITIAL_PRICE（200000000000）
      // -timestamp：时间戳，表示价格更新的时间，用于判断价格是否过期（stale）或是否为不完整轮次
      // -startedAt：开始时间，表示该轮次价格更新的起始时间，通常用于辅助计算价格更新的时间有效性。
      // 该操作是异步的，用于更新预言机价格数据。
      // 模拟价格更新时间=0场景
      await mockAggregator.updateRoundData(1, INITIAL_PRICE, 0, 1);
      await expect(
        contract.getLatestPrice(mockAddress)
      ).to.be.revertedWithCustomError(contract, "IncompleteRound");
    });

    it.skip("should revert if price data is stale", async () => {
      // 模拟过期价格场景
      // 通过查看MockV3Aggregator源码 返回的answeredInRound始终等于roundId  所以这个场景模拟不出来  先跳过吧
      await mockAggregator.updateAnswer(INITIAL_PRICE);
      const currentTime = Math.floor(Date.now() / 1000);
      await mockAggregator.updateRoundData(10, INITIAL_PRICE, currentTime, 5);
      await expect(
        contract.getLatestPrice(mockAddress)
      ).to.be.revertedWithCustomError(contract, "StalePrice");
    });
  });
  */

  describe("getUsdValue", async () => {
    it("should correctly calculate USD value for a given amount", async () => {
      const amount = ethers.parseEther("1"); // 1 ETH
      const usdValue = await contract.getUsdValue(amount, mockAddress);

      // Expected: (1 * 1e18) * 200000000000 / 1e8 = 2000000000000000000000
      expect(usdValue).to.equal(2000000000000000000000n);
    });

    it("should return zero USD value for zero amount", async () => {
      const amount = 0;
      const usdValue = await contract.getUsdValue(amount, mockAddress);
      expect(usdValue).to.equal(0);
    });

    it("should revert on multiplication overflow", async () => {
      // 模拟乘法溢出的场景
      const amount = ethers.MaxUint256;
      //期望该调用会触发交易回滚（reverted），即执行失败，用于测试合约在处理超大数值时的异常处理机制。
      await expect(
        contract.getUsdValue(amount, mockAddress)
      ).to.be.revertedWithCustomError(contract, "MultiplicationOverflow");
    });
  });
});
