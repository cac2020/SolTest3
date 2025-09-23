const { ethers, upgrades } = require("hardhat");
const path = require("path");
const fs = require("fs");

module.exports = async function ({ deployments, getNamedAccounts }) {
  // 从部署对象中解构获取get方法，用于获取已部署合约的信息
  const { get } = deployments;
  // 获取命名账户中的deployer账户，用于执行部署操作
  const { deployer } = await getNamedAccounts();

  // 1. 获取已部署的模板合约实例和地址（依赖 01_deploy_auction.js）
  const auctionTemplate = await get("Auction");
  const templateAddress = auctionTemplate.address;
  console.log("拍卖模板合约Auction地址：", templateAddress);

  // 2. 部署可升级的工厂合约（使用 deployProxy）
  //获取AuctionFactory工厂合约工厂实例，用于部署或升级合约
  const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
  // 使用 deployProxy 方法部署可升级的工厂合约
  const factoryProxy = await upgrades.deployProxy(
    AuctionFactory,
    [deployer, deployer, templateAddress], // 构造函数参数：模板合约地址
    {
      initializer: "initialize", //指定初始化函数的名称
      //unsafeAllow?: ValidationError[],//允许某些 “安全校验错误”（如状态变量布局警告），不建议生产环境使用。
      //constructorArgs?: unknown[],//逻辑合约构造函数的参数（极少用，因可升级合约构造函数通常为空）
      //initialOwner?: string, 指定代理的 “管理员地址”（仅对透明代理有效）。
      //unsafeSkipProxyAdminCheck?: boolean, 跳过代理管理员的安全校验（极不安全，仅测试用）。
      //timeout?: number,交易确认超时时间（毫秒），默认 60000。
      //pollingInterval?: number, 交易确认轮询间隔（毫秒），默认 5000。
      redeployImplementation: "onchange", //控制是否重新部署逻辑合约：- always：每次部署都重新部署逻辑合约；- never：从不重新部署（复用已部署的）；- onchange：逻辑合约代码变化时才重新部署（默认）
      //txOverrides?: ethers.Overrides, 交易覆盖参数（如 gasLimit、gasPrice、value 等）
      kind: "uups", //指定代理模式：- uups：UUPS 代理（逻辑合约自身控制升级）；- transparent：透明代理（独立管理员控制升级）。
      //useDefenderDeploy?: boolean, //是否通过 OpenZeppelin Defender 服务部署（更安全，适合生产）。
      //proxyFactory?: ethers.ContractFactory,//自定义代理工厂合约（默认用插件内置的）。
      //deployFunction?: () => Promise<EthersOrDefenderDeployment>,自定义部署逻辑函数（覆盖默认部署流程）。
    }
  );
  //代理合约地址
  const factoryProxyAddress = await factoryProxy.getAddress();
  //实现合约地址
  const impleAddress = await upgrades.erc1967.getImplementationAddress(
    factoryProxyAddress
  );
  console.log(
    `AuctionFactoryProxy address: ${factoryProxyAddress} \nAuctionFactory address: ${impleAddress}`
  );

  // 3.保存实现合约部署信息
  const storePath = path.resolve(__dirname, "../.cache/AuctionFactory.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      factoryProxyAddress,
      impleAddress,
      abi: AuctionFactory.interface.format("json"),
    })
  );

  // 4. 用 hardhat-deploy 的 save 方法保存代理地址（便于后续读取）
  await deployments.save("AuctionFactory", {
    address: factoryProxyAddress,
    abi: factoryProxy.interface.format("json"),
  });
};

// 声明依赖：先部署FeeManager、 Auction 模板合约
module.exports.dependencies = ["FeeManager","Auction"];
// 标签分组
module.exports.tags = ["AuctionFactory", "factory","all"];
