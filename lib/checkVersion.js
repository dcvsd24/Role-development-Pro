// 版本检查模块：必定检查，检查结果与检查时间缓存到 config.json
// 缓存有效期一天：当天重复运行直接复用缓存，零点后（次日）重新从远程获取并覆盖旧结果
var printVersion = async function () {
  try {
    let currentVersion = JSON.parse(file.readTextSync("manifest.json")).version;
    log.info(`当前版本为：{x}`, currentVersion);

    // 当天日期（YYYY-MM-DD，本地时区），用于缓存有效期判定
    const todayStr = formatDate(new Date());
    const cached = readVersionCheckCache();

    // 当天已检查过：直接复用缓存结果，不再发起网络请求
    if (cached && cached.checkedAt === todayStr) {
      log.info(`今日已完成版本检查（${cached.checkedAt}，最新版本 ${cached.version}），直接使用缓存结果`);
      if (cached.needUpdate) {
        await showUpdateNotice(cached.version);
      } else {
        log.info("当前已是最新版本");
      }
      return;
    }

    log.info("正在检查远程版本...");
    let response = await http.request(
      "GET",
      "https://cnb.cool/yuxu666/Character-Cultivation-Pro-Test/-/git/raw/main/manifest.json"
    );

    let remoteData = JSON.parse(response.body);
    let latestVersion = remoteData.version;

    if (!latestVersion) {
      log.warn("远程版本号获取失败，跳过版本检查");
      log.info(`==== 不影响脚本正常运行 ====`);
      return;
    }

    const hasUpdate = needUpdate(currentVersion, latestVersion);

    // 保存检查结果与检查时间到 config.json（覆盖旧的检查结果）
    try {
      saveVersionCheckCache({
        version: latestVersion,
        needUpdate: hasUpdate,
        checkedAt: todayStr,
        timestamp: Utils.getNow()
      });
      log.info(`✅ 版本检查结果已保存：最新版本 ${latestVersion}，检查时间 ${todayStr}`);
    } catch (saveError) { if (Utils.isCancellationError(saveError)) throw saveError;
      log.warn(`保存版本检查结果失败: ${saveError.message}`);
    }

    if (hasUpdate) {
      await showUpdateNotice(latestVersion);
    } else {
      log.info("当前已是最新版本");
    }
  } catch (error) { if (Utils.isCancellationError(error)) throw error;
    if (error.message.includes("不允许使用HTTP请求")) {
      log.warn("获取版本号失败，请在调度器中右键本脚本 -> 修改通用设置 -> JS HTTP权限-> 禁用改为启用");
      log.info(`==== 不影响脚本正常运行 ====`);
    } else if (error.message.includes("A task was canceled")) {
    } else {
      log.warn(`获取新版本号出错，跳过检查: ${error.message}`);
      log.info(`==== 不影响脚本正常运行 ====`);
    }
  }
};

var needUpdate = function (currentVersion, latestVersion) {
  const currentParts = currentVersion.split('.').map(Number);
  const latestParts = latestVersion.split('.').map(Number);

  const maxLength = Math.max(currentParts.length, latestParts.length);

  for (let i = 0; i < maxLength; i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;

    if (currentPart < latestPart) {
      return true;
    } else if (currentPart > latestPart) {
      return false;
    }
  }

  return false;
};

// 版本检查缓存条目在 config.json 数组中的单 key 对象名
var VERSION_CHECK_KEY = "versionCheck";

// 本地日期格式化：YYYY-MM-DD
var formatDate = function (d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// 读取 config.json 中缓存的版本检查结果（无缓存或读取失败返回 null）
var readVersionCheckCache = function () {
  try {
    const configArray = JSON.parse(file.readTextSync(Constants.CONFIG_PATH));
    if (!Array.isArray(configArray)) return null;
    for (const item of configArray) {
      if (item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, VERSION_CHECK_KEY)) {
        return item[VERSION_CHECK_KEY];
      }
    }
    return null;
  } catch (e) { if (Utils.isCancellationError(e)) throw e;
    return null; // config.json 尚未生成或读取失败，视为无缓存
  }
};

// 保存版本检查结果到 config.json（已有条目则覆盖，无则追加）
var saveVersionCheckCache = function (result) {
  let configArray = [];
  try {
    configArray = JSON.parse(file.readTextSync(Constants.CONFIG_PATH));
    if (!Array.isArray(configArray)) configArray = [];
  } catch (e) { if (Utils.isCancellationError(e)) throw e;
    configArray = [];
  }
  let found = false;
  for (const item of configArray) {
    if (item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, VERSION_CHECK_KEY)) {
      item[VERSION_CHECK_KEY] = result;
      found = true;
      break;
    }
  }
  if (!found) configArray.push({ [VERSION_CHECK_KEY]: result });
  file.writeTextSync(Constants.CONFIG_PATH, JSON.stringify(configArray, null, 2));
};

// 输出发现新版本的提示（含更新方式指引）
var showUpdateNotice = async function (latestVersion) {
  log.info("=".repeat(20));
  log.info(" ");
  log.info("{text}:{v}", "发现新版本！", latestVersion);
  notification.send(`角色养成一条龙Pro版 ⚠️⚠️发现新版本！${latestVersion}`);
  log.info(" ");
  log.info("=".repeat(20));
  log.info(`更新方式：软件左侧菜单 -> 全自动 -> JS脚本  -> 脚本仓库 -> 更新仓库`);
  log.info(`更新完毕后 {text1} 在左侧找到 {txt2} -> 上方点击 {txt3} -> 找到本脚本并点击 -> 右侧点击{txt4}`,
    "打开仓库",
    "Javascript 脚本",
    "已订阅",
    "再次订阅"
  );
  await sleep(7000);
};
