'use strict';

const fs = require('fs');
const path = require('path');

const electron = require('electron');
const electronConfig = require('electron-config');
const request = require('request');

const packageMeta = require('../../../package.json');
const ocsManagerConfig = require('../../configs/ocs-manager.json');

import StatusManager from 'js/StatusManager.js';
import Root from '../components/Root.js';

{
    const remote = electron.remote;

    const webSocket = new WebSocket(`ws://localhost:${ocsManagerConfig.port}`);
    const statusManager = new StatusManager();
    const root = new Root('[data-component="Root"]');
    const mainWebview = root.mainArea.browsePage.element.querySelector('[data-webview="main"]');

    let isStartup = true;
    let installTypes = null;
    let installedItems = null;

    function setup() {
        document.title = packageMeta.productName;

        setupWebSocket();
        setupStatusManager();
        setupWebView();
        setupEvent();

        if (isStartup) {
            root.mainArea.startupDialog.show();
        }
        statusManager.dispatch('browse-page');
    }

    function setupWebSocket() {
        webSocket.onopen = () => {
            console.log('WebSocket open');
            sendWebSocketMessage('', 'ConfigHandler::getAppConfigInstallTypes', []);
        };

        webSocket.onclose = () => {
            console.log('WebSocket close');
        };

        webSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            console.log('WebSocket message received');
            console.log(data);

            if (data.func === 'ConfigHandler::getAppConfigInstallTypes') {
                installTypes = data.data[0];
                sendWebSocketMessage('', 'ConfigHandler::getUsrConfigInstalledItems', []);
            }
            else if (data.func === 'ConfigHandler::getUsrConfigInstalledItems') {
                installedItems = data.data[0];

                root.mainArea.collectionPage.update({
                    installTypes: installTypes,
                    installedItems: installedItems
                });

                if (root.mainArea.installedItemsPage.state) {
                    root.mainArea.installedItemsPage.update({
                        installType: root.mainArea.installedItemsPage.state.installType,
                        isApplicableType: root.mainArea.installedItemsPage.state.isApplicableType,
                        installTypes: installTypes,
                        installedItems: installedItems
                    });
                }
            }
            else if (data.func === 'DesktopThemeHandler::isApplicableType') {
                root.toolBar.update({
                    backAction: 'collection-page',
                    forwardAction: '',
                    homeAction: 'browse-page',
                    collectionAction: 'collection-page',
                    indicator: root.toolBar.state.indicator,
                    upgrade: root.toolBar.state.upgrade
                });

                root.mainArea.installedItemsPage.update({
                    installType: data.id,
                    isApplicableType: data.data[0],
                    installTypes: installTypes,
                    installedItems: installedItems
                });

                root.mainArea.changePage('installedItemsPage');
            }
            else if (data.func === 'ItemHandler::metadataSetChanged') {
                //sendWebSocketMessage('', 'ItemHandler::metadataSet', []);
            }
            else if (data.func === 'ItemHandler::metadataSet') {
                //console.log(data.data[0]);
            }
            else if (data.func === 'ItemHandler::downloadStarted') {
                if (data.data[0].status !== 'success_downloadstart') {
                    console.error(data.data[0].message);
                }
                else if (data.data[0].metadata.command === 'install') {
                    mainWebview.executeJavaScript(
                        `document.querySelector('meta[property="og:image"]').getAttribute('content')`,
                        false,
                        (result) => {
                            let previewPicUrl = '';
                            if (result) {
                                previewPicUrl = result;
                            }
                            else if (data.data[0].metadata.provider && data.data[0].metadata.content_id) {
                                previewPicUrl = `${data.data[0].metadata.provider}content/previewpic/${data.data[0].metadata.content_id}`;
                            }
                            if (previewPicUrl) {
                                downloadPreviewPic(previewPicUrl, btoa(data.data[0].metadata.url));
                            }
                        }
                    );
                }
                root.statusBar.addItem(data.data[0]);
            }
            else if (data.func === 'ItemHandler::downloadFinished') {
                if (data.data[0].status !== 'success_download') {
                    console.error(data.data[0].message);
                }
                root.statusBar.updateItem(data.data[0]);
            }
            else if (data.func === 'ItemHandler::downloadProgress') {
                root.statusBar.updateItemDownloadProgress(data.data[0], data.data[1], data.data[2]);
            }
            else if (data.func === 'ItemHandler::saveStarted') {
                if (data.data[0].status !== 'success_savestart') {
                    console.error(data.data[0].message);
                }
                root.statusBar.updateItem(data.data[0]);
            }
            else if (data.func === 'ItemHandler::saveFinished') {
                if (data.data[0].status !== 'success_save') {
                    console.error(data.data[0].message);
                }
                root.statusBar.updateItem(data.data[0]);
            }
            else if (data.func === 'ItemHandler::installStarted') {
                if (data.data[0].status !== 'success_installstart') {
                    console.error(data.data[0].message);
                }
                root.statusBar.updateItem(data.data[0]);
            }
            else if (data.func === 'ItemHandler::installFinished') {
                if (data.data[0].status !== 'success_install') {
                    console.error(data.data[0].message);
                }
                root.statusBar.updateItem(data.data[0]);
                sendWebSocketMessage('', 'ConfigHandler::getUsrConfigInstalledItems', []);
            }
            else if (data.func === 'ItemHandler::uninstall') {
                removePreviewPic(btoa(data.id));
            }
            else if (data.func === 'ItemHandler::uninstallStarted') {
                if (data.data[0].status !== 'success_uninstallstart') {
                    console.error(data.data[0].message);
                }
            }
            else if (data.func === 'ItemHandler::uninstallFinished') {
                if (data.data[0].status !== 'success_uninstall') {
                    console.error(data.data[0].message);
                }
                sendWebSocketMessage('', 'ConfigHandler::getUsrConfigInstalledItems', []);
            }
        };

        webSocket.onerror = (event) => {
            console.error(event.data);
        };
    }

    function setupStatusManager() {
        statusManager.registerAction('side-panel', () => {
            root.sidePanel.toggle();
        });

        statusManager.registerAction('about-dialog', () => {
            root.mainArea.aboutDialog.show();
        });

        statusManager.registerAction('ocs-url-dialog', (resolve, reject, params) => {
            root.mainArea.ocsUrlDialog.update({
                ocsUrl: params.ocsUrl,
                providerKey: params.providerKey,
                contentId: params.contentId,
                installTypes: installTypes
            });
            root.mainArea.ocsUrlDialog.show();
        });

        statusManager.registerAction('process-ocs-url', (resolve, reject, params) => {
            root.mainArea.ocsUrlDialog.hide();
            sendWebSocketMessage('', 'ItemHandler::getItemByOcsUrl', [params.ocsUrl, params.providerKey, params.contentId]);
        });

        statusManager.registerAction('open-destination', (resolve, reject, params) => {
            const url = `file://${installTypes[params.installType].destination}`;
            sendWebSocketMessage(url, 'SystemHandler::openUrl', [url]);
        });

        statusManager.registerAction('remove-statusbar-item', (resolve, reject, params) => {
            root.statusBar.removeItem(params);
        });

        statusManager.registerAction('browse-page', () => {
            root.toolBar.update({
                backAction: 'main-webview-back',
                forwardAction: 'main-webview-forward',
                homeAction: 'start-page',
                collectionAction: 'collection-page',
                indicator: root.toolBar.state.indicator,
                upgrade: root.toolBar.state.upgrade
            });

            root.mainArea.changePage('browsePage');
        });

        statusManager.registerAction('start-page', (resolve, reject, params) => {
            const config = new electronConfig({name: 'application'});

            if (params.startPage) {
                config.set('startPage', params.startPage);
            }

            mainWebview.setAttribute('src', config.get('startPage'));

            statusManager.dispatch('browse-page');
        });

        statusManager.registerAction('main-webview-back', () => {
            if (mainWebview.canGoBack()) {
                mainWebview.goBack();
            }
        });

        statusManager.registerAction('main-webview-forward', () => {
            if (mainWebview.canGoForward()) {
                mainWebview.goForward();
            }
        });

        statusManager.registerAction('collection-page', () => {
            root.toolBar.update({
                backAction: '',
                forwardAction: '',
                homeAction: 'browse-page',
                collectionAction: 'collection-page',
                indicator: root.toolBar.state.indicator,
                upgrade: root.toolBar.state.upgrade
            });

            root.mainArea.changePage('collectionPage');
        });

        statusManager.registerAction('installed-items-page', (resolve, reject, params) => {
            sendWebSocketMessage(params.installType, 'DesktopThemeHandler::isApplicableType', [params.installType]);
        });

        statusManager.registerAction('open-url', (resolve, reject, params) => {
            sendWebSocketMessage(params.url, 'SystemHandler::openUrl', [params.url]);
        });

        statusManager.registerAction('open-file', (resolve, reject, params) => {
            const url = `file://${params.path}`;
            sendWebSocketMessage(url, 'SystemHandler::openUrl', [url]);
        });

        statusManager.registerAction('apply-theme', (resolve, reject, params) => {
            sendWebSocketMessage(params.path, 'DesktopThemeHandler::applyTheme', [params.path, params.installType]);
        });

        statusManager.registerAction('remove-file', (resolve, reject, params) => {
            sendWebSocketMessage(params.itemKey, 'ItemHandler::uninstall', [params.itemKey]);
        });

        statusManager.registerAction('upgrade-page', () => {
            root.toolBar.update({
                backAction: '',
                forwardAction: '',
                homeAction: 'browse-page',
                collectionAction: 'collection-page',
                indicator: root.toolBar.state.indicator,
                upgrade: root.toolBar.state.upgrade
            });

            root.mainArea.changePage('upgradePage');
        });

        statusManager.registerAction('check-update', (resolve, reject) => {
            console.log('Checking for update');

            fetch(packageMeta._releaseMeta)
            .then((response) => {
                if (response.ok) {
                    return response.json();
                }
                return Promise.reject(new Error('Network response was not ok'));
            })
            .then((data) => {
                if (data.versioncode > packageMeta._versioncode) {
                    console.log('Found newer version');

                    if (process.env.APPIMAGE == path.join(remote.app.getPath('home'), '.local', 'bin', 'ocsstore.AppImage')) {
                        for (const releasefile of data.releasefiles) {
                            if (releasefile.url.toLowerCase().endsWith('x86_64.appimage')) {
                                const dirPath = path.join(remote.app.getPath('home'), '.cache', 'ocsstore');
                                const filePath = path.join(dirPath, 'ocsstore.AppImage');

                                if (!isDirectory(dirPath)) {
                                    fs.mkdirSync(dirPath);
                                }

                                request.get(releasefile.url)
                                .on('error', (error) => {
                                    console.error(error);
                                })
                                .pipe(fs.createWriteStream(filePath));

                                break;
                            }
                        }
                    }
                    else {
                        resolve(data);
                    }
                }
            })
            .catch((error) => {
                reject(error);
            });
        });

        statusManager.registerView('check-update', (state) => {
            root.toolBar.showUpgradeButton();
            root.mainArea.upgradePage.update(state);
        });

        statusManager.dispatch('check-update');
    }

    function setupWebView() {
        const config = new electronConfig({name: 'application'});

        mainWebview.setAttribute('src', config.get('startPage'));
        mainWebview.setAttribute('preload', './scripts/renderers/ipc-renderer.js');

        mainWebview.addEventListener('did-start-loading', () => {
            console.log('did-start-loading');
            root.toolBar.showIndicator();
        });

        mainWebview.addEventListener('did-stop-loading', () => {
            console.log('did-stop-loading');
            root.toolBar.hideIndicator();
        });

        mainWebview.addEventListener('dom-ready', () => {
            console.log('dom-ready');
            mainWebview.send('dom-modify');

            if (isStartup) {
                isStartup = false;
                root.mainArea.startupDialog.hide();
            }
        });

        mainWebview.addEventListener('ipc-message', (event) => {
            console.log('IPC message received');
            console.log([event.channel, event.args]);

            if (event.channel === 'ocs-url') {
                statusManager.dispatch('ocs-url-dialog', {
                    ocsUrl: event.args[0],
                    providerKey: event.args[1],
                    contentId: event.args[2]
                });
            }
            else if (event.channel === 'external-url') {
                statusManager.dispatch('open-url', {url: event.args[0]});
            }
        });
    }

    function setupEvent() {
        root.element.addEventListener('click', (event) => {
            if (event.target.closest('button[data-dispatch]')) {
                event.preventDefault();
                event.stopPropagation();

                const targetElement = event.target.closest('button[data-dispatch]');
                const type = targetElement.getAttribute('data-dispatch');

                let params = {};
                if (targetElement.getAttribute('data-params')) {
                    params = JSON.parse(targetElement.getAttribute('data-params'));
                }

                statusManager.dispatch(type, params);
            }
            else if (event.target.closest('a[data-dispatch]')) {
                event.preventDefault();
                event.stopPropagation();

                const targetElement = event.target.closest('a[data-dispatch]');
                const type = targetElement.getAttribute('data-dispatch');

                let params = {};
                if (targetElement.getAttribute('data-params')) {
                    params = JSON.parse(targetElement.getAttribute('data-params'));
                }

                statusManager.dispatch(type, params);
            }
            else if (event.target.closest('a[target]')) {
                event.preventDefault();
                event.stopPropagation();

                statusManager.dispatch('open-url', {url: event.target.closest('a[target]').getAttribute('href')});
            }
        }, false);
    }

    function sendWebSocketMessage(id, func, data) {
        webSocket.send(JSON.stringify({
            id: id,
            func: func,
            data: data
        }));
    }

    function isFile(filePath) {
        try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
                return true;
            }
        }
        catch (error) {
            console.error(error);
        }
        return false;
    }

    function isDirectory(dirPath) {
        try {
            const stats = fs.statSync(dirPath);
            if (stats.isDirectory()) {
                return true;
            }
        }
        catch (error) {
            console.error(error);
        }
        return false;
    }

    function downloadPreviewPic(url, filename) {
        const dirPath = path.join(remote.app.getPath('userData'), 'previewpic');
        const filePath = path.join(dirPath, filename);

        if (!isDirectory(dirPath)) {
            fs.mkdirSync(dirPath);
        }

        request.get(url)
        .on('error', (error) => {
            console.error(error);
        })
        .pipe(fs.createWriteStream(filePath));
    }

    function removePreviewPic(filename) {
        const filePath = path.join(remote.app.getPath('userData'), 'previewpic', filename);

        if (isFile(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    setup();
}
