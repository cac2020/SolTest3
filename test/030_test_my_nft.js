const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("MyNFT", function () {
  let myNFT;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // 获取签名者
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

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
    await deployments.fixture(["deployMyNFT"]);
    //deployments.get("xxx") 返回的是一个包含合约地址和ABI等信息的部署对象，而不是可以直接调用方法的合约实例。
    const MyNFTProxy = await deployments.get("MyNFTProxy");
    //获取代理合约两种方法：
    //方法一：通过已知实现合约名称和代理合约地址获取合约实例 ：第一个参数是实现合约名称 可以从编译产物找到ABI，第二个参数是代理合约地址
    myNFT = await ethers.getContractAt("MyNFT", MyNFTProxy.address);

    //方法二： attach
    //获取实现合约工厂对象
    //const FeeManager = await ethers.getContractFactory("FeeManager");
    //创建一个新的合约实例，该实例的所有方法调用都会发送到指定的 address，并使用当前合约工厂的 ABI 解析方法。
    //feeManager = FeeManager.attach(FeeManagerProxy.address);
  });

  //初始化函数测试分组
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await myNFT.owner()).to.equal(await owner.getAddress());
    });

    it("Should have correct name and symbol", async function () {
      expect(await myNFT.name()).to.equal("MyNFT");
      expect(await myNFT.symbol()).to.equal("MNFT");
    });
  });

  //铸造函数测试分组
  describe("Minting", function () {
    it("Should mint a new NFT to the specified address", async function () {
      const tokenId = await myNFT.safeMint(await addr1.getAddress());
      //wait()方法确保交易被打包确认。
      await tokenId.wait();

      expect(await myNFT.ownerOf(0)).to.equal(await addr1.getAddress());
      expect(await myNFT.balanceOf(await addr1.getAddress())).to.equal(1);
    });

    it("Should increment token ID for each mint", async function () {
      await myNFT.safeMint(await addr1.getAddress());
      await myNFT.safeMint(await addr2.getAddress());

      expect(await myNFT.ownerOf(0)).to.equal(await addr1.getAddress());
      expect(await myNFT.ownerOf(1)).to.equal(await addr2.getAddress());
    });

    it("Should fail to mint a new NFT if not called by the owner", async function () {
      const myNFTFromAddr1 = myNFT.connect(addr1);
      await expect(myNFTFromAddr1.safeMint(await addr1.getAddress()))
        .to.be.revertedWithCustomError(myNFT, "OwnableUnauthorizedAccount")
        .withArgs(await addr1.getAddress());
    });
  });

  //升级测试分组
  describe("Upgradeability", function () {
    it("Should upgrade to a new implementation", async function () {
      //myNFT是代理合约 根据代理合约地址 获取当前实现合约地址
      const currentImpl = await upgrades.erc1967.getImplementationAddress(
        await myNFT.getAddress()
      );

      // 创建新的实现合约
      const MyNFTV2Factory = await ethers.getContractFactory("MyNFTV2");
      const myNFTV2 = await upgrades.upgradeProxy(myNFT, MyNFTV2Factory);

      // 检查实现地址是否改变
      const newImpl = await upgrades.erc1967.getImplementationAddress(
        await myNFTV2.getAddress()
      );
      expect(newImpl).to.not.equal(currentImpl);
    });

    it("Should fail to upgrade if not called by the owner", async function () {
      //使用另外一个地址连接
      //ethers.getContractFactory() 是ethers.js注入Hardhat环境的包装方法，本质是创建ethers.js里ContractFactory 实例的快捷方式
      const MyNFTV2Factory = await ethers.getContractFactory("MyNFT", addr1);
      await expect(upgrades.upgradeProxy(myNFT, MyNFTV2Factory))
        .to.be.revertedWithCustomError(myNFT, "OwnableUnauthorizedAccount")
        .withArgs(await addr1.getAddress());
    });
  });

  //权限测试分组
  describe("Ownership", function () {
    it("Should transfer ownership", async function () {
      await myNFT.transferOwnership(await addr1.getAddress());
      expect(await myNFT.owner()).to.equal(await addr1.getAddress());
    });

    it("Should renounce ownership", async function () {
      await myNFT.renounceOwnership();
      expect(await myNFT.owner()).to.equal(ethers.ZeroAddress);
    });
  });
});
