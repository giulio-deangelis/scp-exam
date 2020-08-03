/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"zexam/zexam-web/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});