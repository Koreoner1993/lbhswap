// onchain.js — LBH production on-chain logic
// Parser-safe JavaScript (no YAML-incompatible syntax)

var TON_API_BASE = 'https://tonapi.io/v2';

// 🔴 PUT YOUR REAL LBH JETTON MASTER ADDRESS HERE
var LBH_JETTON_MASTER = 'EQDNls1rlSBVIroqkUtSWctEcBg6LzdDexs8aNZIp84aQ5T8 ';

// ---------- BUSINESS LOGIC ----------

function getDiscountTier(lbhBalance) {
  if (lbhBalance >= 100000) return 'Platinum (25%)';
  if (lbhBalance >= 50000) return 'Gold (12%)';
  if (lbhBalance >= 10000) return 'Silver (7%)';
  if (lbhBalance >= 1000) return 'Bronze (5%)';
  return 'None';
}

function getUserRole(lbhBalance) {
  return lbhBalance >= 1000 ? 'Builder' : 'Worker';
}

// ---------- CORE FETCHERS ----------

function fetchJson(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) {
      throw new Error('HTTP error ' + r.status);
    }
    return r.json();
  });
}

function fetchTonBalance(address) {
  return fetchJson(TON_API_BASE + '/accounts/' + address)
    .then(function (data) {
      return Number(data.balance || 0) / 1000000000;
    });
}

function fetchJettons(address) {
  return fetchJson(TON_API_BASE + '/accounts/' + address + '/jettons')
    .then(function (data) {
      return Array.isArray(data.balances) ? data.balances : [];
    });
}

function fetchLbhBalance(address) {
  return fetchJettons(address).then(function (balances) {
    var i;
    for (i = 0; i < balances.length; i++) {
      var j = balances[i];
      if (j.jetton && j.jetton.address === LBH_JETTON_MASTER) {
        var decimals = Number(j.jetton.decimals || 0);
        return Number(j.balance || 0) / Math.pow(10, decimals);
      }
    }
    return 0;
  });
}

function fetchLbhSupply() {
  return fetchJson(TON_API_BASE + '/jettons/' + LBH_JETTON_MASTER)
    .then(function (data) {
      var supply = Number(data.total_supply || 0);
      var decimals = Number(data.decimals || 0);
      return supply / Math.pow(10, decimals);
    });
}

// ---------- UI BINDING ----------

function updateText(id, value) {
  var el = document.getElementById(id);
  if (el) {
    el.innerText = value;
  }
}

// ---------- MAIN ENTRY ----------

function loadOnchainData(wallet) {
  if (!wallet || !wallet.account || !wallet.account.address) {
    console.warn('Wallet not connected');
    return;
  }

  var address = String(wallet.account.address);

  Promise.all([
    fetchTonBalance(address),
    fetchLbhBalance(address),
    fetchLbhSupply()
  ])
    .then(function (results) {
      var tonBalance = results[0];
      var lbhBalance = results[1];
      var lbhSupply = results[2];

      var tier = getDiscountTier(lbhBalance);
      var role = getUserRole(lbhBalance);

      updateText('tonBalance', tonBalance.toFixed(2) + ' TON');
      updateText('lbhBalance', Math.floor(lbhBalance) + ' LBH');
      updateText('lbhSupply', 'LBH Supply: ' + Math.floor(lbhSupply));
      updateText('discountTier', tier);
      updateText('userRole', 'Role: ' + role);
    })
    .catch(function (err) {
      console.error('On-chain load failed', err);
    });
}

// ---------- AUTO-REFRESH ----------

// Call this AFTER wallet connects:
// loadOnchainData(window.wallet);

setInterval(function () {
  if (window.wallet && window.wallet.account) {
    loadOnchainData(window.wallet);
  }
}, 5000);
