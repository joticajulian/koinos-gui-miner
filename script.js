const { ipcRenderer } = require('electron');
const { shell } = require('electron');
const Koinos = require('./assets/js/constants.js');
const colorsys = require('colorsys');
const timeStartHSV = colorsys.rgbToHsv({r: 95, g: 181, b: 107});
const timeEndHSV = colorsys.rgbToHsv({r: 198, g: 86, b: 86});
let minerIsRunning = false;
var currentHashrate = null;
let countdown = 0;
var counterFunc = null;

function onStateRestoration(s) {
  // Restore state
  onMinerActivated(s.get(Koinos.StateKey.MinerActivated));
  onKoinBalanceUpdate(s.get(Koinos.StateKey.KoinBalanceUpdate));
  onEthBalanceUpdate(s.get(Koinos.StateKey.EthBalanceUpdate));
  setAppVersion(s.get(Koinos.StateKey.Version));

  if (s.get(Koinos.StateKey.ActivateCountdown) > 0) {
    onActivateCountdown(s.get(Koinos.StateKey.ActivateCountdown));
  }

  // Restore configuration
  let config = s.get(Koinos.StateKey.Configuration);
  document.getElementById(Koinos.Field.HiveUser).value = config.hiveUser;
  document.getElementById(Koinos.Field.Tip).checked = config.developerTip;
  document.getElementById(Koinos.Field.EthEndpoint).value = config.endpoint;
  document.getElementById(Koinos.Field.ProofFrequency).value = config.proofFrequency;
  toggleProofPeriod(config.proofPer);

  // Attach callbacks
  const errorMessage = document.getElementById(Koinos.Field.Errors);
  const documentation = document.getElementById(Koinos.Field.DocumentationLink);
  const openGithub = document.getElementById(Koinos.Field.GitHubIcon);
  const warningGithubIcon = document.getElementById(Koinos.Field.WarningGitHubIcon);
  const errorClose = document.getElementById(Koinos.Field.ErrorClose);
  const warningMessage = document.getElementById(Koinos.Field.Warnings);
  const warningClose = document.getElementById(Koinos.Field.WarningClose);
  const logo = document.getElementById(Koinos.Field.Logo);
  const company = document.getElementById(Koinos.Field.Company);

  company.addEventListener('click', e => {
    shell.openExternal('https://www.openorchard.io/');
  });

  logo.addEventListener('click', e => {
    shell.openExternal('https://www.koinos.io/');
  });

  documentation.addEventListener('click', e => {
    shell.openExternal('https://github.com/open-orchard/koinos-gui-miner/blob/master/README.md');
  });

  warningGithubIcon.addEventListener('click', e => {
    shell.openExternal('https://github.com/open-orchard/koinos-gui-miner/issues');
  });

  openGithub.addEventListener('click', e => {
    shell.openExternal('https://github.com/open-orchard/koinos-gui-miner/issues');
  });

  errorClose.addEventListener('click', e => {
    errorMessage.style.display = "none";
  });

  warningClose.addEventListener('click', e => {
    warningMessage.style.display = "none";
  });
}

function setAppVersion(version) {
  let v = "Koinos Miner: " + version;
  v += ", Node: " + process.versions.node;
  v += ", Chrome: " + process.versions.chrome;
  v += ", Electon: " + process.versions.electron;
  document.getElementById(Koinos.Field.VersionInfo).innerHTML = v;
  document.getElementById(Koinos.Field.MinerVersion).innerHTML = "v" + version;
}

function toggleProofPeriod(which) {
  // Do not change toggle when mining
  if (minerIsRunning) {
    return;
  }

  var day = document.getElementById(Koinos.Field.CheckDay);
  var week = document.getElementById(Koinos.Field.CheckWeek);
  if (which === 'day') {
    week.classList.remove("checked");
    day.classList.add("checked");
  } else {
    day.classList.remove("checked");
    week.classList.add("checked");
  }
}

function getProofPer() {
  var day = document.getElementById(Koinos.Field.CheckDay);
  if (day.classList.contains("checked")) {
    return "day";
  }
  else {
    return "week";
  }
}

function secondsToDhms(seconds) {
  seconds = Number(seconds);
  let d = Math.floor(seconds / (3600*24));
  let h = Math.floor(seconds % (3600*24) / 3600);
  let m = Math.floor(seconds % 3600 / 60);
  let s = Math.floor(seconds % 60);

  let dDisplay = d > 0 ? d + (d == 1 ? " day" : " days") : "";
  let hDisplay = h > 0 ? ((d) ? ", ": "") + h + (h == 1 ? " hour" : " hours") : "";
  let mDisplay = m > 0 ? ((d|h) ? ", ": "") + m + (m == 1 ? " minute" : " minutes") : "";
  let sDisplay = s > 0 ? ((d|h|m) ? ", ": "") + s + (s == 1 ? " second" : " seconds") : "";
  return dDisplay + hDisplay + mDisplay + sDisplay;
}

function onErrorReport(e) {
  if (e.kMessage !== undefined) {
    const errors = document.getElementById(Koinos.Field.Errors);
    const errorMessage = document.getElementById(Koinos.Field.ErrorMessage);
    errorMessage.innerHTML = e.kMessage;
    errors.style.display = "flex";
    ipcRenderer.invoke(Koinos.StateKey.StopMiner);
  }
}

function onWarningReport(e) {
  if (e.kMessage !== undefined) {
    const warnings = document.getElementById(Koinos.Field.Warnings);
    const warningMessage = document.getElementById(Koinos.Field.WarningMessage);
    warningMessage.innerHTML = e.kMessage;
    warnings.style.display = "flex";
  }
}

function formatRemainingTime(time) {
  if (time > 86400 * 7) {
    return (time / (86400 * 7)).toFixed(2) + " Weeks";
  }
  else if (time > 86400) {
    return (time / 86400).toFixed(2) + " Days";
  }
  else if (time > 3600) {
    return (time / 3600).toFixed(2) + " Hours";
  }
  else {
    return (time / 60).toFixed(2) + " Minutes";
  }
}

function onEthBalanceUpdate(b) {
  let wei = b[0];
  let cost = b[1];

  if (cost > 0) {
    let numProofs = Math.floor(wei/cost);

    let remainingProofTime =
      (numProofs * ( document.getElementById(Koinos.Field.CheckDay).classList.contains("checked") ? 1 : 7 ) * 86400)
      / document.getElementById(Koinos.Field.ProofFrequency).value;
    // Gradient is 24 hours from 8 remaining to 40 remaining.
    let percentGradient = 1 - Math.min(Math.max(remainingProofTime - 28800, 0), 115200) / 86400.0;
    let hsv = {
      h: Math.floor((timeEndHSV.h - timeStartHSV.h) * percentGradient + timeStartHSV.h),
      s: Math.floor((timeEndHSV.s - timeStartHSV.s) * percentGradient + timeStartHSV.s),
      v: Math.floor((timeEndHSV.v - timeStartHSV.v) * percentGradient + timeStartHSV.v)
    };

    document.getElementById(Koinos.Field.EthBalanceSub).innerHTML = "Approx. <br/>" + formatRemainingTime(remainingProofTime) + " Left";
    document.getElementById(Koinos.Field.EthBalanceSub).style.color = colorsys.stringify(colorsys.hsvToRgb(hsv));
  }
  else {
    document.getElementById(Koinos.Field.EthBalanceSub).innerHTML = "";
  }

  document.getElementById(Koinos.Field.EthBalance).innerHTML = (wei / Koinos.Ether.WeiPerEth).toFixed(4) + " ETH";
}

function onHashrateReportString(s) {
  let stuff = s.split(" ");
  let rate = parseFloat(stuff[0]).toFixed(2);
  document.getElementById(Koinos.Field.HashrateCurrent).innerHTML = rate.toString();
  document.getElementById(Koinos.Field.HashrateSuffix).innerHTML = stuff[1];
}

function onHashrateReport(s) {
  hashrateSpinner(false);
  currentHashrate = s;
}

function onMinerActivated(state) {
  if (state) {
    document.getElementById(Koinos.Field.Tip).setAttribute("disabled", "true");
    document.getElementById(Koinos.Field.CheckToggle).className += " grayed";
    document.getElementById(Koinos.Field.HiveUser).setAttribute("disabled", "true");
    document.getElementById(Koinos.Field.HiveUser).className += " grayed";
    document.getElementById(Koinos.Field.EthEndpoint).setAttribute("disabled", "true");
    document.getElementById(Koinos.Field.EthEndpoint).className += " grayed";
    document.getElementById(Koinos.Field.ProofFrequency).setAttribute("disabled", "true");
    document.getElementById(Koinos.Field.ProofFrequency).className += " grayed";
    document.getElementById(Koinos.Field.CheckDay).className += " grayed";
    document.getElementById(Koinos.Field.CheckWeek).className += " grayed";
    document.getElementById(Koinos.Field.CircleGlow).className += " blob";
  }
  else {
    document.getElementById(Koinos.Field.Tip).removeAttribute("disabled");
    document.getElementById(Koinos.Field.CheckToggle).classList.remove("grayed");
    document.getElementById(Koinos.Field.HiveUser).removeAttribute("disabled");
    document.getElementById(Koinos.Field.HiveUser).classList.remove("grayed");
    document.getElementById(Koinos.Field.EthEndpoint).removeAttribute("disabled");
    document.getElementById(Koinos.Field.EthEndpoint).classList.remove("grayed");
    document.getElementById(Koinos.Field.ProofFrequency).removeAttribute("disabled");
    document.getElementById(Koinos.Field.ProofFrequency).classList.remove("grayed");
    document.getElementById(Koinos.Field.CheckDay).classList.remove("grayed");
    document.getElementById(Koinos.Field.CheckWeek).classList.remove("grayed");
    document.getElementById(Koinos.Field.CircleGlow).classList.remove("blob");

    document.getElementById(Koinos.Field.HashrateCurrent).innerHTML = "0.0";
    document.getElementById(Koinos.Field.HashrateSuffix).innerHTML = "";
    currentHashrate = 0;
  }

  hashrateSpinner(state);
  powerButton(state);
  minerIsRunning = state;
}

function onKoinBalanceUpdate(balance) {
  document.getElementById(Koinos.Field.KoinBalance).innerHTML = balance;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function powerButton(state) {
  let btn = document.getElementById(Koinos.Field.SvgButton).classList;
  let btnOn = document.getElementById(Koinos.Field.PowerButton).classList;
  if (state) {
    btn.remove('red');
    btn.add('green');
    btnOn.remove('redBorder');
    btnOn.add('greenBorder');
  } else {
    btn.remove('green');
    btn.add('red');
    btnOn.remove('greenBorder');
    btnOn.add('redBorder');
  }
}

function onKeyManagementClick() {
  ipcRenderer.invoke(Koinos.StateKey.ManageKeys);
}

function hashrateSpinner(state) {
  if (state) {
    document.getElementById(Koinos.Field.HashrateSpinner).style.display = "";
    document.getElementById(Koinos.Field.HashrateCurrent).innerHTML = "";
    document.getElementById(Koinos.Field.HashrateSuffix).innerHTML = "";
  }
  else {
    document.getElementById(Koinos.Field.HashrateSpinner).style.display = "none";
  }
}

function fadeOut(element) {
  document.getElementById(element).classList.remove("fade-in");
  document.getElementById(element).classList += " fade-out";
  setTimeout(function() { document.getElementById(element).style.display = "none"; }, 1000);
}

function fadeIn(element) {
  document.getElementById(element).style.display = "block";
  document.getElementById(element).classList.remove("fade-out");
  document.getElementById(element).classList += " fade-in";
}

function overlayCancel () {
  fadeOut(Koinos.Field.Overlay);
  clearInterval(counterFunc);
  ipcRenderer.invoke(Koinos.StateKey.StopMiner);
}

function onActivateCountdown(startTime) {
  if (startTime > now()) {
    countdown = startTime - now();
    document.getElementById(Koinos.Field.Countdown).innerHTML = secondsToDhms(countdown);
    fadeIn(Koinos.Field.Overlay);
    counterFunc = setInterval(function() {
      document.getElementById(Koinos.Field.Countdown).innerHTML = secondsToDhms(countdown);
      countdown = startTime - now();

      if (countdown < 0) {
        clearInterval(counterFunc);
        fadeOut(Koinos.Field.Overlay);
      }
    }, 1000);
  }
}

function isValidEndpoint(endpoint) {
  return (/^(https?|wss?):\/\/[^\s$.?#].[^\s]*$/i.test(endpoint));
}

function toggleMiner() {
  let hiveUser = document.getElementById(Koinos.Field.HiveUser).value;
  ipcRenderer.invoke(Koinos.StateKey.ToggleMiner, hiveUser);
}

ipcRenderer.on(Koinos.StateKey.RestoreState, (event, arg) => {
  onStateRestoration(arg);
});

ipcRenderer.on(Koinos.StateKey.KoinBalanceUpdate, (event, arg) => {
  onKoinBalanceUpdate(arg);
});

ipcRenderer.on(Koinos.StateKey.HashrateReportString, (event, arg) => {
  onHashrateReportString(arg);
});

ipcRenderer.on(Koinos.StateKey.HashrateReport, (event, arg) => {
  onHashrateReport(arg);
});

ipcRenderer.on(Koinos.StateKey.MinerActivated, (event, state) => {
  onMinerActivated(state);
});

ipcRenderer.on(Koinos.StateKey.EthBalanceUpdate, (event, arg) => {
  onEthBalanceUpdate(arg);
});

ipcRenderer.on(Koinos.StateKey.ErrorReport, (event, arg) => {
  onErrorReport(arg);
});

ipcRenderer.on(Koinos.StateKey.WarningReport, (event, arg) => {
  onWarningReport(arg);
});

ipcRenderer.on(Koinos.StateKey.ActivateCountdown, (event, arg) => {
  onActivateCountdown(arg);
});
