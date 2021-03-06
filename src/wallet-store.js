'use strict';

var CryptoJS = require('crypto-js');

var MyWallet = require('./wallet');
var WalletCrypto = require('./wallet-crypto');

var hasProp = {}.hasOwnProperty;

var WalletStore = (function() {

  var languageCodeToLanguage = {
    'de': 'German',
    'hi': 'Hindi',
    'no': 'Norwegian',
    'ru': 'Russian',
    'pt': 'Portuguese',
    'bg': 'Bulgarian',
    'fr': 'French',
    'zh-cn': 'Chinese Simplified',
    'hu': 'Hungarian',
    'sl': 'Slovenian',
    'id': 'Indonesian',
    'sv': 'Swedish',
    'ko': 'Korean',
    'el': 'Greek',
    'en': 'English',
    'it': 'Italiano',
    'es': 'Spanish',
    'vi': 'Vietnamese',
    'th': 'Thai',
    'ja': 'Japanese',
    'pl': 'Polish',
    'da': 'Danish',
    'ro': 'Romanian',
    'nl': 'Dutch',
    'tr': 'Turkish'
  };
  var currencyCodeToCurrency = {
    'ISK': 'lcelandic Króna',
    'HKD': 'Hong Kong Dollar',
    'TWD': 'New Taiwan Dollar',
    'CHF': 'Swiss Franc',
    'EUR': 'Euro',
    'DKK': 'Danish Krone',
    'CLP': 'Chilean, Peso',
    'USD': 'U.S. Dollar',
    'CAD': 'Canadian Dollar',
    'CNY': 'Chinese Yuan',
    'THB': 'Thai Baht',
    'AUD': 'Australian Dollar',
    'SGD': 'Singapore Dollar',
    'KRW': 'South Korean Won',
    'JPY': 'Japanese Yen',
    'PLN': 'Polish Zloty',
    'GBP': 'Great British Pound',
    'SEK': 'Swedish Krona',
    'NZD': 'New Zealand Dollar',
    'BRL': 'Brazil Real',
    'RUB': 'Russian Ruble'
  };
  var demo_guid = 'abcaa314-6f67-6705-b384-5d47fbe9d7cc';
  var password; //Password
  var guid; //Wallet identifier
  var double_encryption = false; //If wallet has a second password
  var dpasswordhash; //double encryption Password
  var language = 'en';
  var mnemonicVerified = false;
  var transactions = [];
  var n_tx = 0;
  var addresses = {};
  var maxAddr = 1000;
  var didUpgradeToHd = null;
  var address_book = {};
  var pbkdf2_iterations = null;
  var final_balance = 0;
  var total_sent = 0;
  var total_received = 0;
  var tx_notes = {};
  var defaultAccountIdx = 0;
  var disable_logout = false;
  var mixer_fee = 0.5;
  var isAccountRecommendedFeesValid = true;
  var amountToRecommendedFee = {};
  var latest_block = null;
  var tx_tags = {};
  var tag_names = [];
  var api_code = "0";
  var haveBuildHDWallet = false;
  var real_auth_type = 0; //The real two factor authentication. Even if there is a problem with the current one (for example error 2FA sending email).
  var encrypted_wallet_data; //Encrypted wallet data (Base64, AES 256)
  var payload_checksum; //SHA256 hash of the current wallet.aes.json
  var myHDWallet = null;
  var sharedcoin_endpoint; //The URL to the sharedcoin node
  var sharedKey; //Shared key used to prove that the wallet has succesfully been decrypted, meaning you can't overwrite a wallet backup even if you have the guid
  var didSetGuid = false;
  var isPolling = false;
  var legacyAddressesNumTxFetched = 0;
  var default_pbkdf2_iterations = 5000;
  var isRestoringWallet = false;
  var counter = 0;
  var logout_timeout; //setTimeout return value for the automatic logout
  var logout_ticker;
  var sync_pubkeys = false;
  var isSynchronizedWithServer = true;
  var haveSetServerTime = false; //Whether or not we have synced with server time
  var serverTimeOffset = 0; //Difference between server and client time
  var numOldTxsToFetchAtATime = 10;
  var event_listeners = []; //Emits Did decrypt wallet event (used on claim page)
  var archTimer; //Delayed Backup wallet timer
  var paidTo = {};

  var wallet_options = {
    fee_policy : 0,  //Default Fee policy (-1 Tight, 0 Normal, 1 High)
    logout_time : 600000, //Default 10 minutes
    additional_seeds : [],
    enable_multiple_accounts : true //Allow multiple accounts in the wallet
  };
  ////////////////////////////////////////////////////////////////////////////
  // Private functions
  ////////////////////////////////////////////////////////////////////////////
  var unsafeAddLegacyAddress = function(key) {
    if ((key.addr == null) || !MyWallet.isAlphaNumericSpace(key.addr)) {
      return this.sendEvent("msg", {
        type: "error",
        message: 'Your wallet contains an invalid address. This is a sign of possible corruption, please double check all your BTC is accounted for. Backup your wallet to remove this error.'
      });
    } else {
      if (key.tag === 1 || !MyWallet.isAlphaNumericSpace(key.tag)) {
        key.tag = null;
      }
      if ((key.label != null) && !MyWallet.isAlphaNumericSpace(key.tag)) {
        key.label = null;
      }
      return addresses[key.addr] = key;
    }
  };
  ////////////////////////////////////////////////////////////////////////////
  return {
    ////////////////////////////////////////////////////////////////////////////
    // Public functions
    ////////////////////////////////////////////////////////////////////////////
    setPbkdf2Iterations: function(iterations) {
      pbkdf2_iterations = iterations;
      return;
    },
    getPbkdf2Iterations: function() {
      return pbkdf2_iterations;
    },
    getLanguage: function() {
      if (language != null) {
        return language;
      } else {
        return MyStore.get('language');
      }
    },
    setLanguage: function(lan) {
      MyStore.put('language', lan);
      language = lan;
    },
    walletIsFull: function() {
      return Object.keys(addresses).length >= maxAddr;
    },
    getLanguages: function() {
      return languageCodeToLanguage;
    },
    getCurrencies: function() {
      return currencyCodeToCurrency;
    },
    didVerifyMnemonic: function() {
      mnemonicVerified = true;
      MyWallet.backupWalletDelayed();
    },
    setMnemonicVerified: function(bool) {
      mnemonicVerified = bool;
    },
    isMnemonicVerified: function() {
      return mnemonicVerified;
    },
    getXpubs: function(){
      function getxpub(hdacc) {return hdacc.extendedPublicKey;}
      function isNotArchived(hdacc) {return !hdacc.archived;}
      var accounts = myHDWallet? myHDWallet.getAccounts() : [];
      return accounts.filter(isNotArchived).map(getxpub);
    },
    getTransactions: function() {
      return transactions;
    },
    pushTransaction: function(tx) {
      transactions.push(tx);
    },
    getAllTransactions: function() {
      return transactions.map(MyWallet.processTransaction);
    },
    didUpgradeToHd: function() {
      return didUpgradeToHd;
    },
    setDidUpgradeToHd: function(bool) {
      didUpgradeToHd = bool;
    },
    getAddressBook: function() {
      return address_book;
    },
    getAddressBookLabel: function(address) {
      return address_book[address];
    },
    deleteAddressBook: function(addr) {
      delete address_book[addr];
      MyWallet.backupWalletDelayed();
    },
    addAddressBookEntry: function(addr, label) {
      var isValidLabel = MyWallet.isAlphaNumericSpace(label) && MyWallet.isValidAddress(addr);
      if (isValidLabel) {
        address_book[addr] = label;
      }
      return isValidLabel;
    },
    newAddressBookFromJSON: function(addressBook) {
      address_book = {};
      var addEntry = function(e) {
        WalletStore.addAddressBookEntry(e.addr, e.label);
      };
      if (addressBook !== null && addressBook !== undefined) {
        addressBook.forEach(addEntry);
      }
    },
    newLegacyAddressesFromJSON: function(keysArray) {
      if (keysArray !== null && keysArray !== undefined) {
        keysArray.map(unsafeAddLegacyAddress);
      }
    },
    getAddresses: function() {
      return addresses;
    },
    getAddress: function(address) {
      if (address in addresses) {
        return addresses[address];
      } else {
        return null;
      }
    },
    getValueOfLegacyAddress: function(address) {
      if (address in addresses) {
        return parseInt(addresses[address].value);
      } else {
        return 0;
      }
    },
    addToBalanceOfLegacyAddress: function(address, amount) {
      if (address in addresses) {
        addresses[address].balance += amount;
      }
    },
    legacyAddressExists: function(address) {
      return address in addresses;
    },
    getLegacyAddressTag: function(address) {
      if (address in addresses) {
        return addresses[address].tag;
      } else {
        return null;
      }
    },
    setLegacyAddressTag: function(address, tag) {
      addresses[address].tag = tag;
    },
    getLegacyAddressLabel: function(address) {
      if (address in addresses) {
        return addresses[address].label;
      } else {
        return null;
      }
    },
    setLegacyAddressBalance: function(address, balance) {
      addresses[address].balance = balance;
    },
    isActiveLegacyAddress: function(address) {
      return (address in addresses) && (addresses[address].tag !== 2);
    },
    isWatchOnlyLegacyAddress: function(address) {
      return (address in addresses) && (addresses[address].priv == null);
    },
    getLegacyAddressBalance: function(address) {
      if (address in addresses) {
        return addresses[address].balance;
      } else {
        return null;
      }
    },
    getTotalBalanceForActiveLegacyAddresses: function() {
      var add = function(x, y) {return x + y;};
      var balances = [];
      var k, o;
      for (k in addresses) {
        if (!hasProp.call(addresses, k)) continue;
        o = addresses[k];
        if (o.tag !== 2) balances.push(o.balance);
      }
      return balances.reduce(add, 0);
    },
    deleteLegacyAddress: function(address) {
      delete addresses[address];
      MyWallet.backupWalletDelayed();
    },
    getPrivateKey: function(address, pw) {
      if (address in addresses) {
        var ep = addresses[address].priv;
        var up = pw ? WalletCrypto.decryptSecretWithSecondPassword(ep, pw, sharedKey, pbkdf2_iterations) : ep;
        return up;
      } else {
        return null;
      }
    },
    encryptPrivateKey: function(ad, pw, sk, it) {
      if (ad in addresses) {
        var pk = addresses[ad].priv;
        addresses[ad].priv = WalletCrypto.encryptSecretWithSecondPassword(pk, pw, sk, it);
        return true
      } else {
        return false;
      }
    },
    setLegacyAddressLabel: function(address, label, success, error) {
      if (label.length > 0 && !MyWallet.isAlphaNumericSpace(label)) {
        return error && error();
      } else {
        addresses[address].label = label;
        MyWallet.backupWalletDelayed();
        return success && success();
      }
    },
    unArchiveLegacyAddr: function(address) {
      var addr;
      addr = addresses[address];
      if (addr.tag === 2) {
        addr.tag = null;
        MyWallet.backupWalletDelayed('update', function() {
          return MyWallet.get_history();
        });
      } else {
        this.sendEvent("msg", {
          type: "error",
          message: 'Cannot Unarchive This Address'
        });
      }
    },
    archiveLegacyAddr: function(address) {
      var addr;
      addr = addresses[address];
      if (addr.tag === null || addr.tag === undefined || addr.tag === 0) {
        addr.tag = 2;
        MyWallet.backupWalletDelayed('update', function() {
          return MyWallet.get_history();
        });
      } else {
        this.sendEvent("msg", {
          type: "error",
          message: 'Cannot Archive This Address'
        });
      }
    },
    getAllLegacyAddresses: function() {
      var k, results;
      results = [];
      for (k in addresses) {
        if (!hasProp.call(addresses, k)) continue;
        results.push(k);
      }
      return results;
    },
    getPreferredLegacyAddress: function() {
      var k, o;
      return ((function() {
        var results;
        results = [];
        for (k in addresses) {
          if (!hasProp.call(addresses, k)) continue;
          o = addresses[k];
          if ((o.priv != null) && this.isActiveLegacyAddress(k)) {
            results.push(k);
          }
        }
        return results;
      }).call(this))[0];
    },
    hasLegacyAddresses: function() {
      return Object.keys(addresses).length !== 0;
    },
    getLegacyActiveAddresses: function() {
      var k, results;
      results = [];
      for (k in addresses) {
        if (!hasProp.call(addresses, k)) continue;
        if (this.isActiveLegacyAddress(k)) {
          results.push(k);
        }
      }
      return results;
    },
    getLegacyArchivedAddresses: function() {
      var k, results;
      results = [];
      for (k in addresses) {
        if (!hasProp.call(addresses, k)) continue;
        if (!this.isActiveLegacyAddress(k)) {
          results.push(k);
        }
      }
      return results;
    },
    mapToLegacyAddressesPrivateKeys: function(f) {
      var k, o;
      for (k in addresses) {
        if (!hasProp.call(addresses, k)) continue;
        o = addresses[k];
        if (o.priv != null) {
          o.priv = f(o.priv);
        }
      }
    },
    tagLegacyAddressesAsSaved: function() {
      var k, o;
      for (k in addresses) {
        if (!hasProp.call(addresses, k)) continue;
        o = addresses[k];
        if (o.tag === 1) {
          delete o.tag;
        }
      }
    },
    addLegacyAddress: function(address, privKey) {
      var existing;
      existing = addresses[address];
      if ((existing == null) || existing.length === 0) {
        addresses[address] = {
          addr: address,
          priv: privKey,
          balance: null
        };
        return true;
      } else {
        if ((existing.priv == null) && (privKey != null)) {
          existing.priv = privKey;
          return true;
        } else {
          return false;
        }
      }
    },
    getNTransactions: function() {
      return n_tx;
    },
    setNTransactions: function(numberOfTransactions) {
      n_tx = numberOfTransactions;
    },
    incNTransactions: function() {
      n_tx++;
    },
    getFinalBalance: function() {
      return final_balance;
    },
    setFinalBalance: function(amount) {
      final_balance = amount;
    },
    addToFinalBalance: function(amount) {
      final_balance += amount;
    },
    getTotalSent: function() {
      return total_sent;
    },
    setTotalSent: function(amount) {
      total_sent = amount;
    },
    addToTotalSent: function(amount) {
      total_sent += amount;
    },
    getTotalReceived: function() {
      return total_received;
    },
    setTotalReceived: function(amount) {
      total_received = amount;
    },
    addToTotalReceived: function(amount) {
      total_received += amount;
    },
    getNote: function(txHash) {
      if (txHash in tx_notes) {
        return tx_notes[txHash];
      } else {
        return null;
      }
    },
    deleteNote: function(txHash) {
      delete tx_notes[txHash];
      MyWallet.backupWalletDelayed();
    },
    initializeNote: function(txHash, text) {
      var isValidNote;
      isValidNote = text != null;
      if (isValidNote) {
        tx_notes[txHash] = text;
      }
      return isValidNote;
    },
    setNote: function(txHash, text) {
      var isValidNote;
      isValidNote = text != null;
      if (isValidNote) {
        tx_notes[txHash] = text;
        MyWallet.backupWalletDelayed();
      }
      return isValidNote;
    },
    getNotes: function() {
      return tx_notes;
    },
    setDefaultAccountIndex: function(accountIdx) {
      if (accountIdx != null) {
        defaultAccountIdx = accountIdx;
      } else {
        defaultAccountIdx = 0;
      }
    },
    changeDefaultAccountIndex: function(accountIdx) {
      if (defaultAccountIdx === accountIdx) return;
      WalletStore.setDefaultAccountIndex(accountIdx);
      MyWallet.backupWalletDelayed();
    },
    getDefaultAccountIndex: function() {
      return defaultAccountIdx;
    },
    disableLogout: function() {
      disable_logout = true;
    },
    enableLogout: function() {
      disable_logout = false;
    },
    isLogoutDisabled: function() {
      return disable_logout;
    },
    getMixerFee: function() {
      return mixer_fee;
    },
    setMixerFee: function(fee) {
      if (fee != null) {
        mixer_fee = fee;
      }
    },
    isAccountRecommendedFeesValid: function() {
      return isAccountRecommendedFeesValid;
    },
    setIsAccountRecommendedFeesValid: function(bool) {
      isAccountRecommendedFeesValid = bool;
    },
    getAmountToRecommendedFee: function(amount) {
      if (amount in amountToRecommendedFee) {
        return amountToRecommendedFee[amount];
      } else {
        return null;
      }
    },
    setAmountToRecommendedFee: function(amount, recFee) {
      amountToRecommendedFee[amount] = recFee;
    },
    getLatestBlock: function() {
      return latest_block;
    },
    setLatestBlock: function(block) {
      var i, len, ref, tx;
      if (block != null) {
        latest_block = block;
        ref = this.getTransactions();
        for (i = 0, len = ref.length; i < len; i++) {
          tx = ref[i];
          tx.setConfirmations(MyWallet.getConfirmationsForTx(latest_block, tx));
        }
        this.sendEvent('did_set_latest_block');
      }
    },
    getAllTags: function() {
      return tx_tags;
    },
    getTags: function(tx_hash) {
      if (tx_hash in tx_tags) {
        return tx_tags[tx_hash];
      } else {
        return [];
      }
    },
    setTags: function(allTags) {
      var tags, tx_hash;
      if (allTags != null) {
        for (tx_hash in allTags) {
          tags = allTags[tx_hash];
          if ((tags != null) && MyWallet.isAlphaNumericSpace(tags)) {
            tx_tags[tx_hash] = tags;
          }
        }
      }
    },
    setTag: function(tx_hash, idx) {
      if (tx_tags[tx_hash] == null) {
        tx_tags[tx_hash] = [];
      }
      tx_tags[tx_hash].push(idx);
      MyWallet.backupWalletDelayed();
    },
    unsetTag: function(tx_hash, idx) {
      var index, tags;
      tags = tx_tags[tx_hash];
      index = tx_tags.indexOf(idx);
      if (index > -1) {
        tx_tags.splice(index, 1);
      }
      MyWallet.backupWalletDelayed();
    },
    deleteTag: function(idx) {
      var index, tags, tx_hash;
      tag_names.splice(idx, 1);
      for (tx_hash in tx_tags) {
        tags = tx_tags[tx_hash];
        index = tx_tags.indexOf(idx);
        if (index > -1) {
          tx_tags.splice(index, 1);
        }
      }
    },
    getTagNames: function() {
      return tag_names;
    },
    addTag: function(name) {
      var isValidTag;
      isValidTag = MyWallet.isAlphaNumericSpace(name);
      if (isValidTag) {
        tag_names.push(name);
        MyWallet.backupWalletDelayed();
      }
      return isValidTag;
    },
    renameTag: function(idx, name) {
      var isValidTag;
      isValidTag = MyWallet.isAlphaNumericSpace(name);
      if (isValidTag) {
        tag_names[idx] = name;
        MyWallet.backupWalletDelayed();
      }
      return isValidTag;
    },
    setTagNames: function(names) {
      if (names != null) {
        tag_names = names;
      }
    },
    setAPICode: function(stringInt) {
      api_code = stringInt;
    },
    getAPICode: function() {
      return api_code;
    },
    isHaveBuildHDWallet: function () {
      return haveBuildHDWallet;
    },
    setHaveBuildHDWallet: function (bool) {
      haveBuildHDWallet = bool;
    },
    getDoubleEncryption: function() {
      return double_encryption;
    },
    setDoubleEncryption: function(bool) {
      double_encryption = bool;
    },
    setRealAuthType: function(number) {
      real_auth_type = number;
    },
    get2FAType: function() {
      return real_auth_type;
    },
    get2FATypeString: function() {
      var stringType = "";
      switch(real_auth_type){
      case 0: stringType = null; break;
      case 1: stringType = "Yubikey"; break;
      case 2: stringType = "Email"; break;
      case 3: stringType = "Yubikey MtGox"; break;
      case 4: stringType = "Google Auth"; break;
      case 5: stringType = "SMS"; break;
      default: stringType = null; break;
      }
      return stringType;
    },
    getGuid: function() {
      return guid;
    },
    setGuid: function(stringValue) {
      guid = stringValue;
    },
    isDemoWallet: function() {
      return guid === demo_guid;
    },
    getDPasswordHash: function() {
      return dpasswordhash;
    },
    setDPasswordHash: function(stringValue) {
      dpasswordhash = stringValue;
    },
    generatePayloadChecksum: function() {
      return CryptoJS.SHA256(encrypted_wallet_data).toString();
    },
    setEncryptedWalletData: function(data) {
      if (!data || data.length == 0) {
        encrypted_wallet_data = null;
        payload_checksum = null;
      }
      else {
        encrypted_wallet_data = data;
        payload_checksum = this.generatePayloadChecksum();
      }
    },
    getEncryptedWalletData: function() {
      return encrypted_wallet_data;
    },
    getPayloadChecksum: function() {
      return payload_checksum;
    },
    setPayloadChecksum: function(value) {
      payload_checksum = value;
    },
    getHDWallet: function() {
      if (typeof myHDWallet === 'undefined') {
        return null;
      }
      return myHDWallet;
    },
    setHDWallet: function(newValue) {
      myHDWallet = newValue;
      if (newValue) {
        this.sendEvent('hd_wallet_set');
      }
    },
    getSharedcoinEndpoint: function() {
      return sharedcoin_endpoint;
    },
    setSharedcoinEndpoint: function(value) {
      sharedcoin_endpoint = value;
    },
    getSharedKey: function() {
      return sharedKey;
    },
    setSharedKey: function(value) {
      sharedKey = value;
    },
    isDidSetGuid: function () {
      return didSetGuid;
    },
    setDidSetGuid: function () {
      didSetGuid = true;
    },
    isPolling: function () {
      return isPolling;
    },
    setIsPolling: function (bool) {
      isPolling = bool;
    },
    getLegacyAddressesNumTxFetched: function(){
      return legacyAddressesNumTxFetched;
    },
    addLegacyAddressesNumTxFetched: function (number){
      legacyAddressesNumTxFetched += number;
    },
    getDefaultPbkdf2Iterations: function() {
      return default_pbkdf2_iterations;
    },
    isRestoringWallet: function() {
      return isRestoringWallet;
    },
    setRestoringWallet: function (bool) {
      isRestoringWallet = bool;
    },
    incrementCounter: function () {
      counter = counter + 1;
    },
    getCounter: function () {
      return counter;
    },
    getLogoutTimeout: function () {
      return logout_timeout;
    },
    setLogoutTimeout: function (value) {
      if (!logout_ticker) {
        logout_ticker = setInterval(function () {
          if (Date.now() > logout_timeout) {
            clearInterval(logout_ticker);
            MyWallet.logout();
          }
        }, 20000);
      }
      logout_timeout = value;
    },
    setSyncPubKeys: function (bool){
      sync_pubkeys = bool;
    },
    isSyncPubKeys: function (){
      return sync_pubkeys;
    },
    isSynchronizedWithServer: function (){
      return isSynchronizedWithServer;
    },
    setIsSynchronizedWithServer: function (bool){
      isSynchronizedWithServer = bool;
    },
    isHaveSetServerTime: function (){
      return haveSetServerTime;
    },
    setHaveSetServerTime: function (){
      haveSetServerTime = true;
    },
    getServerTimeOffset: function (){
      return serverTimeOffset;
    },
    setServerTimeOffset: function (offset){
      serverTimeOffset = offset;
    },
    getNumOldTxsToFetchAtATime: function (){
      return numOldTxsToFetchAtATime;
    },
    addEventListener: function(func){
      event_listeners.push(func);
    },
    sendEvent: function(event_name, obj){
      for (var listener in event_listeners) {
        event_listeners[listener](event_name, obj);
      }
    },
    isCorrectMainPassword: function(candidate){
      return password === candidate;
    },
    changePassword: function(new_password, success, error){
      password = new_password;
      MyWallet.backupWallet('update', function(){
        if (success)
          success();
      }, function() {
        if (error)
          error();
      });
    },
    unsafeSetPassword: function(newPassword){
      password = newPassword;
    },
    getPassword: function(){
      return password;
    },
    getMultiAccountSetting: function() {
      return wallet_options.enable_multiple_accounts;
    },
    setMultiAccountSetting: function(flag) {
      MyWallet.backupWalletDelayed();
      wallet_options.enable_multiple_accounts = flag;
    },
    addAdditionalSeeds: function(val) {
      wallet_options.additional_seeds.push(val);
    },
    getAdditionalSeeds: function(val) {
      return wallet_options.additional_seeds;
    },
    getLogoutTime: function() {
      return wallet_options.logout_time;
    },
    setLogoutTime: function(logout_time) {
      wallet_options.logout_time = logout_time;
      this.resetLogoutTimeout();
    },
    resetLogoutTimeout: function() {
      this.setLogoutTimeout(Date.now() + this.getLogoutTime());
    },
    getFeePolicy: function() {
      return wallet_options.fee_policy;
    },
    setFeePolicy: function(policy) {
      if (policy != -1 && policy != 0 && policy != 1)
        throw 'Invalid fee policy';

      wallet_options.fee_policy = parseInt(policy);
      //Fee Policy is stored in wallet so must save it
      MyWallet.backupWallet('update', function() {
        if (successCallback)
          successCallback(response);
      }, function() {
        if (errorCallback)
          errorCallback();
      });
    },
    getWalletOptions: function (){
      return wallet_options;
    },
    clearArchTimer: function (){
      if (archTimer) {
        clearInterval(archTimer);
        archTimer = null;
      }
    },
    setArchTimer: function (val){
      archTimer = val;
    },
    getPaidToDictionary: function()  {
      return paidTo;
    },
    markPaidToEntryRedeemed: function(tx_hash, time) {
      paidTo[tx_hash].redeemedAt = time;
    },
    setPaidToElement: function (tx, value) {
      paidTo[tx] = value;
    },
    setPaidTo: function (dict){
      paidTo = dict;
    }
  };
})();

module.exports = WalletStore;
