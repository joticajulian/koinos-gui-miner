const electron = require('electron');
const fs = require('fs');
const { app, ipcMain, BrowserWindow } = require("electron");
const path = require('path');
const Koinos = require('./assets/js/constants.js');
let KoinosMiner = require('koinos-miner');
let { Looper } = require("koinos-miner/looper.js");
let Retry = require("koinos-miner/retry.js");
const { assert } = require("console");
const SSC = require('sscjs');
let miner = null;
let mainWindow = null;

const ssc = new SSC('https://api.hive-engine.com/rpc/');
const configFile = path.join((electron.app || electron.remote.app).getPath('userData'), 'config.json');

let state = new Map([
  [Koinos.StateKey.MinerActivated, false],
  [Koinos.StateKey.KoinBalanceUpdate, 0],
  [Koinos.StateKey.EthBalanceUpdate, [0, 0]],
  [Koinos.StateKey.HasKeystore, false],
  [Koinos.StateKey.Version, app.getVersion()]
]);

let config = {
  hiveUser: "",
  poolEndpoint: "https://api.koinos.club",
  proofPeriod: 60,
  endpointTimeout: 5000,
  version: state.get(Koinos.StateKey.Version)
};

function notify(event, args) {
  state.set(event, args);
  if (mainWindow !== null) {
    mainWindow.send(event, args);
  }
}

function readConfiguration() {
  if (fs.existsSync(configFile)) {
    let userConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    let keys = Object.keys(userConfig);
    for (let i = 0; i < keys.length; i++) {
      config[keys[i]] = userConfig[keys[i]];
    }
  }
}

function writeConfiguration() {
  fs.writeFileSync(configFile, JSON.stringify(config));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 600,
    icon: path.join(__dirname, process.platform === "win32" ? 'assets/icons/win/icon.ico' : 'assets/icons/png/64x64.png'),
    titleBarStyle: "hidden",
    resizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: true,
    },
    show: false
  });

  mainWindow.setMenuBarVisibility(false);

  state.set(Koinos.StateKey.Configuration, readConfiguration());

  // and load the index.html of the app.
  mainWindow.loadFile("index.html");

  mainWindow.webContents.on('did-finish-load', function () {
    mainWindow.send(Koinos.StateKey.RestoreState, state);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  });

  // Open the DevTools.
  //win.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
  mainWindow = null;
  login = null;
})

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
})

app.on('before-quit', () => {
  // Should this call stopMiner() ?
  if (miner !== null) {
    miner.stop();
    miner = null;
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function hashrateCallback(hashrate) {
  notify(Koinos.StateKey.HashrateReportString, hashrate);
}

async function updateTokenBalance() {
   try {
      const result = await ssc.findOne('tokens','balances', {
         account: config.hiveUser,
         symbol: "WKOIN",
      });
      notify(Koinos.StateKey.KoinBalanceUpdate, result.balance);
   }
   catch(err) {
      let error = {
         kMessage: "There was a problem retrieving the KOIN balance.",
         error: err
      };
      throw error;
   }
}

async function guiUpdateBlockchain() {
  await Retry('update UI data', async function() {
    await updateTokenBalance();
  });
}

function guiUpdateBlockchainError(e) {
   let error = {
      kMessage: "Could not update the balance.",
      exception: e
      };
   console.log( "[JS] Exception in guiUpdateBlockchainLoop():", e);
   notify(Koinos.StateKey.ErrorReport, error);
}

function proofCallback(wkoin, totalToday) {
  console.log(`
[JS](app.js) ***************************************************
             CONGRATULATIONS @${config.hiveUser}!
             You earned ${wkoin.toFixed(8)} WKOINS

             Total earned in the last 24h: ${totalToday.toFixed(8)} WKOINS
             ***************************************************
`)
  notify(Koinos.StateKey.WarningReport, {
    kMessage: `Congratulations! you earned ${wkoin.toFixed(8)} WKOIN. In the last 24h: ${totalToday.toFixed(8)} WKOIN`
  });
}

function errorCallback(error) {
  notify(Koinos.StateKey.ErrorReport, error);
}

function stopMiner() {
   if (miner !== null) {
      miner.stop();
   }

   miner = null;
   tokenContract = null;
   derivedKey = null;
   state.set(Koinos.StateKey.MinerActivated, false);
   notify(Koinos.StateKey.MinerActivated, state.get(Koinos.StateKey.MinerActivated));
}

ipcMain.handle(Koinos.StateKey.StopMiner, (event, ...args) => {
  stopMiner();
});

ipcMain.handle(Koinos.StateKey.ToggleMiner, async (event, ...args) => {
  try {
    if (state.get(Koinos.StateKey.MinerActivated)) {console.log("stop miner");
      stopMiner();
      return;
    }

    config.hiveUser = args[0];
    miner = new KoinosMiner(
      config.hiveUser,
      60,
      "https://api.koinos.club",
      {
        error: errorCallback,
        hashrate: hashrateCallback,
        proof: proofCallback,
      }
    );
    miner.start();
    guiBlockchainUpdateLoop.start();
    state.set(Koinos.StateKey.MinerActivated, true);
    writeConfiguration();
    notify(Koinos.StateKey.MinerActivated, state.get(Koinos.StateKey.MinerActivated));
  }
  catch (err) {
    console.log(err);
    stopMiner();
    notify(Koinos.StateKey.ErrorReport, err);
  }
});

let guiBlockchainUpdateLoop = new Looper( guiUpdateBlockchain, guiUpdateBlockchainMs = 30*1000, guiUpdateBlockchainError );
