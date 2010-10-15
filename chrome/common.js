/*
    ***** BEGIN LICENSE BLOCK *****
	
	Copyright (c) 2009  Zotero
	                    Center for History and New Media
						George Mason University, Fairfax, Virginia, USA
						http://zotero.org
	
	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	
	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/
	
var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].
						 getService(Components.interfaces.nsIXULAppInfo);
if(appInfo.platformVersion[0] == 2) {
	Components.utils.import("resource://gre/modules/AddonManager.jsm");
} else {
	var AddonManager = false;
}

var ZoteroPluginInstaller = function(addon, failSilently, force) {
	this._addon = addon;
	this._failSilently = failSilently;
	this._force = force;
	
	this.prefService = Components.classes["@mozilla.org/preferences-service;1"].
			getService(Components.interfaces.nsIPrefBranch);
	
	var me = this;
	var extensionIDs = [this._addon.EXTENSION_ID].concat([req.id for each(req in this._addon.REQUIRED_ADDONS)]);
	if(AddonManager) {
		AddonManager.getAddonsByIDs(extensionIDs, function(addons) {
			me._addons = addons;
			me._addonInfoAvailable();
		});
	} else {
		var extMan = Components.classes['@mozilla.org/extensions/manager;1'].
								getService(Components.interfaces.nsIExtensionManager)
		this._addons = [extMan.getItemForID(id) for each(id in extensionIDs)];
		this._addonInfoAvailable();
	}
}

ZoteroPluginInstaller.prototype = {
	"_errorDisplayed":false,
	
	"_addonInfoAvailable":function() {
		this._checkVersions();
		
		this._version = this._addons[0].version;
		try {
			this._addon.verifyNotCorrupt(this);
		} catch(e) {
			return;
		}
		
		if(this._force || (
				(
					this.prefService.getCharPref(this._addon.EXTENSION_PREF_BRANCH+".version") != this._version
					|| (!Zotero.isStandalone && !this.prefService.getBoolPref(this._addon.EXTENSION_PREF_BRANCH+".installed"))
				) && document.getElementById("appcontent"))) {
			var me = this;
			this._progressWindow = window.openDialog("chrome://"+this._addon.EXTENSION_DIR+"/content/progress.xul", "",
							"chrome,resizable=no,close=no,centerscreen");
			this._progressWindow.addEventListener("load", function() { me._firstRunListener() }, false);
		}
	},
	
	"isInstalled":function() {
		return this.prefService.getCharPref(this._addon.EXTENSION_PREF_BRANCH+".version") == this._version && 
			this.prefService.getBoolPref(this._addon.EXTENSION_PREF_BRANCH+".installed");
	},
	
	"getAddonPath":function(addonID) {
		if(AddonManager) {
			for each(var addon in this._addons) {
				if(addon.id == addonID) {
					return this._addons[0].getResourceURI().
						QueryInterface(Components.interfaces.nsIFileURL).file;
				}
			}
		} else {
			return Components.classes["@mozilla.org/extensions/manager;1"].
				getService(Components.interfaces.nsIExtensionManager).
				getInstallLocation(addonID).
				getItemLocation(addonID);
		}
	},
	
	"setProgressWindowLabel":function(value) {
		this._progressWindowLabel.value = value;
	},
	
	"closeProgressWindow":function(value) {
		if(this._progressWindow) this._progressWindow.close();
	},
	
	"success":function() {
		this.closeProgressWindow();
		this.prefService.setCharPref(this._addon.EXTENSION_PREF_BRANCH+".version", this._version);
		this.prefService.setBoolPref(this._addon.EXTENSION_PREF_BRANCH+".installed", true);
		if(this._force) {
			Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
				.getService(Components.interfaces.nsIPromptService)
				.alert(window, this._addon.EXTENSION_STRING,
				'Installation was successful.');
		}
	},
	
	"error":function(error) {
		this.closeProgressWindow();
		this.prefService.setCharPref(this._addon.EXTENSION_PREF_BRANCH+".version", this._version);
		this.prefService.setBoolPref(this._addon.EXTENSION_PREF_BRANCH+".installed", false);
		if(this._failSilently) return;
		if(this._errorDisplayed) return;
		Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components.interfaces.nsIPromptService)
			.alert(null, this._addon.EXTENSION_STRING,
			'Installation could not be completed because an error occurred. Please ensure that '+this._addon.APP+' is closed, and then restart Firefox.');
	},
	
	"_firstRunListener":function() {
		this._progressWindowLabel = this._progressWindow.document.getElementById("progress-label");
		this._progressWindowLabel.value = "Installing "+this._addon.EXTENSION_STRING+"...";
		var me = this;
		window.setTimeout(function() {
			me._progressWindow.focus();
			window.setTimeout(function() {
				me._progressWindow.focus();
				try {
					me._addon.install(me);
				} catch(e) {
					me.error();
					throw e;
				}
			}, 500);
		}, 100);
	},
	
	"_checkVersions":function() {
		for(var i=0; i<this._addon.REQUIRED_ADDONS.length; i++) {
			var checkAddon = this._addon.REQUIRED_ADDONS[i];
			
			// check Zotero version
			try {
				var comp = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
					.getService(Components.interfaces.nsIVersionComparator)
					.compare(this._addons[i+1].version, checkAddon.minVersion);
			} catch(e) {
				var comp = -1;
			}
			
			if(comp < 0) {
				var err = 'This version of '+this._addon.EXTENSION_STRING+' requires '+checkAddon.name+' '+checkAddon.minVersion+
					' or later to run. Please download the latest version of '+checkAddon.name+' from '+checkAddon.url+'.';
				this.error(err);
				if(!this._failSilently) throw err;
			}
		}
	}
}