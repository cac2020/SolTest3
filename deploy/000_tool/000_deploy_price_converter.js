const { deployments} = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  // 从 deployments 对象中解构出 deploy 方法，用于部署合约
  const { deploy } = deployments;
  // 获取命名账户中的 deployer 账户，用于执行部署操作
  const { deployer } = await getNamedAccounts();

  // 部署 PriceConverter 合约，构造函数参数为初始 owner（部署者）
  await deploy('PriceConverter', {
    from: deployer, // 将执行交易的地址（或私钥）。你可以使用`getNamedAccounts`通过名称获取所需地址。
    contract: 'PriceConverter',//这是一个可选字段。如果未指定，默认值为与第一个参数同名的合约
    args: [], // 构造函数的参数列表（若是代理合约，则为升级函数的参数）
    log: true, // 果为true，将记录部署结果（交易哈希、地址和使用的gas）
    //skipIfAlreadyDeployed: true, // 如果设为true，即使同名合约的部署内容不同，也不会尝试重新部署 ,依赖 “本地部署记录” 和 “链上状态” 的双重校验,skipIfAlreadyDeployed 不是 “强制重新部署” 的唯一条件 
    //linkedData?: any; // 允许将任何JSON数据与部署关联。例如，对默克尔树数据很有用
    //libraries?: { [libraryName: string]: Address }; // 允许你将库与部署的合约关联
    //proxy?: boolean | string | ProxyOptions; // 此选项允许将你的合约视为代理（详见下文）

    // 以下是一些常见的交易选项：
    //gasLimit?: string | number | BigNumber;
    //gasPrice?: string | BigNumber;
    //value?: string | BigNumber;
    //nonce?: string | number | BigNumber;

    //estimatedGasLimit?: string | number | BigNumber; // 为加快估算速度，可以提供一个上限gasLimit
    //estimateGasExtra?: string | number | BigNumber; // 此选项允许在估算值基础上增加一个gas缓冲量

    //autoMine?: boolean; // 这会强制执行evm_mine。在允许指定区块延迟的测试网络（如ganache）上，这对加快部署很有用。此选项通过强制挖矿来跳过延迟。
    //deterministicDeployment? boolean | string; // 如果为true，将根据字节码和构造函数参数在确定性地址部署合约。该地址在所有网络上都相同。这会使用create2操作码；如果是字符串，该字符串将用作salt。
    //waitConfirmations?: number; // 交易被包含在区块链中后，需要等待的确认次数
  });
};

//tags 是用于给部署脚本打 “标签” 的机制，方便通过标签筛选需要执行的脚本。
// 其中 all 是一个约定俗成的通用标签，作用是：标记 “该脚本属于项目需要部署的核心合约”，方便一次性部署所有带 all 标签的脚本。
//只需指定 --tags all，就能按顺序执行所有带 all 标签的脚本，无需逐个指定每个脚本的标签。
module.exports.tags = ["deployPriceConverter","all"];