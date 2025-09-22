const { ethers, deployments, upgrades } = require("hardhat");
const  path  = require('path');
const  fs  = require('fs');

module.exports = async ({ getNamedAccounts, deployments }) => {
  // 从 deployments 对象中解构出 save 方法，用于保存部署信息
  const { save } = deployments;
  // 获取命名账户中的 deployer 账户，用于执行部署操作
  const { deployer } = await getNamedAccounts();

  //使用ethers.js库获取名为"MyNFT"的智能合约工厂对象。`getContractFactory`是一个异步函数，用于从已编译的合约ABI和字节码创建合约工厂实例，以便后续部署或与该合约进行交互。
  const MyNFT = await ethers.getContractFactory("MyNFT");
  //通过代理部署合约
  const proxy = await upgrades.deployProxy(
    MyNFT,
    [deployer],
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
  const proxyAddress = await proxy.getAddress();
  //实现合约地址
  const impleAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`MyNFTProxy address: ${proxyAddress} \nMyNFTImplementation address: ${impleAddress}`);

  //保存实现合约部署信息
  const storePath = path.resolve(__dirname, "../.cache/MyNFT.json");
  fs.writeFileSync(storePath, JSON.stringify({
    proxyAddress,
    impleAddress,
    abi: MyNFT.interface.format("json"),
  }));

  // save将合约部署信息持久化到本地文件（deployments/[network]/[name].json），使得：其他部署脚本可通过 deployments.get(name) 获取该合约的地址、ABI 等，实现跨脚本依赖
  await save(
    "MyNFTProxy", //给当前部署的合约指定一个唯一名称，作为后续查询的标识（类似 “键”）
    {
      //描述合约部署的详细信息（核心数据），是一个包含部署关键信息的对象
      address: proxyAddress,//合约部署后的链上地址
      abi: proxy.interface.format("json"),//合约的 ABI（应用二进制接口），用于后续通过 ethers.Contract 实例化合约并交互
      //transactionHash: string 部署合约的交易哈希（带 0x 前缀），用于追溯部署交易
      //args:[]  部署合约时传入的构造函数参数，便于后续复现部署或验证合约。
      //receipt:TransactionReceipt 部署交易的完整收据（包含 gas 消耗、区块号等），详细记录部署过程。
      //bytecode: string 合约部署时的字节码（带 0x 前缀），用于验证合约代码完整性。
    }
  );
};

//tags 是用于给部署脚本打 “标签” 的机制，方便通过标签筛选需要执行的脚本。
// 其中 all 是一个约定俗成的通用标签，作用是：标记 “该脚本属于项目需要部署的核心合约”，方便一次性部署所有带 all 标签的脚本。
//只需指定 --tags all，就能按顺序执行所有带 all 标签的脚本，无需逐个指定每个脚本的标签。
module.exports.tags = ["deployMyNFT", "all"];
