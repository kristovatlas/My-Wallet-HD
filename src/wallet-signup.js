'use strict';

var assert = require('assert');
var $ = require('jquery');
var CryptoJS = require('crypto-js');

var MyWallet = require('./wallet');
var WalletStore = require('./wallet-store');
var WalletCrypto = require('./wallet-crypto');
var BlockchainAPI = require('./blockchain-api');


// Save the javascript wallet to the remote server
function insertWallet(guid, sharedKey, password, extra, successcallback, errorcallback) {
  assert(successcallback, "Success callback missing");
  assert(errorcallback, "Success callback missing");
  assert(guid, "GUID missing");
  assert(sharedKey, "Shared Key missing");

  try {
    var data = MyWallet.makeCustomWalletJSON(null, guid, sharedKey);
    
    //Everything looks ok, Encrypt the JSON output
    var crypted = WalletCrypto.encryptWallet(data, password, WalletStore.getDefaultPbkdf2Iterations(),  WalletStore.didUpgradeToHd() ?  3.0 : 2.0);
    
    if (crypted.length == 0) {
      throw 'Error encrypting the JSON output';
    }
    
    //Now Decrypt the it again to double check for any possible corruption
    WalletCrypto.decryptWallet(
      crypted, 
      password, 
      function success() { // success callback for decryptWallet

        //SHA256 new_checksum verified by server in case of corruption during transit
        var new_checksum = CryptoJS.SHA256(crypted, {asBytes: true}).toString();

        extra = extra || '';

        var post_data = {
          length: crypted.length,
          payload: crypted,
          checksum: new_checksum,
          method : 'insert',
          format : 'plain',
          sharedKey : sharedKey,
          guid : guid
        };

        $.extend(post_data, extra);
        MyWallet.securePost(
          'wallet', 
          post_data,
          function(data) {
            successcallback(data);
          }, 
          function(e) {
            errorcallback(e.responseText);
          }
        );

      },
      function error() { // error callback for decryptWallet
        throw("Decrypting wallet failed");
      }
    );
  } catch (e) {
    errorcallback(e);
  }
}

function generateUUIDs(n, success, error) {
  $.ajax({
    type: "GET",
    timeout: 60000,
    url: BlockchainAPI.getRootURL() + 'uuid-generator',
    data: { format : 'json', n : n, api_code : WalletStore.getAPICode()},
    success: function(data) {
      if (data.uuids && data.uuids.length == n) {
        success(data.uuids);
      } else {
        error('Unknown Error');
      }
    },
    error: function(data) {
      error(data.responseText);
    }
  });
};

function generateNewWallet(password, email, firstAccountName, success, error) {
  this.generateUUIDs(2, function(uuids) {
    var guid = uuids[0];
    var sharedKey = uuids[1];

    if (password.length > 255) {
      throw 'Passwords must be shorter than 256 characters';
    }

    //User reported this browser generated an invalid private key
    if(navigator.userAgent.match(/MeeGo/i)) {
      throw 'MeeGo browser currently not supported.';
    }

    if (guid.length != 36 || sharedKey.length != 36) {
      throw 'Error generating wallet identifier';
    }

    // Upgrade to HD immediately:
    MyWallet.initializeHDWallet(
      null, 
      "", 
      firstAccountName,
      function() {}, 
      function() {
        insertWallet(guid, sharedKey, password, {email : email}, function(message){
          success(guid, sharedKey, password);
        }, function(e) {
          error(e);
        });
      }, 
      function(e) {
        error(e);
      }
    );
  }, error);
};

module.exports = {
  generateUUIDs: generateUUIDs,
  generateNewWallet: generateNewWallet
};
