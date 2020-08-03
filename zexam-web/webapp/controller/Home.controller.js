/* eslint-env es6 */
/* eslint no-console: 0, no-warning-comments: 0 */

sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/m/MessageToast",
	"sap/ui/model/odata/v2/ODataModel",
	"sap/ui/model/json/JSONModel",
	"../util/extensions/String"
], function (Controller, MessageToast, ODataModel, JSONModel) {
	"use strict";

	return Controller.extend("zexam.zexam-web.controller.Home", {

		onInit: function () {
			this._bindModels();
		},

		navTo: function (id) {
			this.byId("splitter").toDetail(this.createId(id));
		},

		onSeriesPress: function (ev) {
			this.navTo("seriesDetail");

			// get the selected element's path from the binding context and bind the form
			const ctxPath = ev.getParameter("listItem").getBindingContextPath();
			this.byId("seriesDetailsForm").bindElement({
				path: ctxPath
			});

			// bind the table
			this.getView().getModel().read("/Serie", {
				urlParameters: {
					"$expand": "Puntate"
				},
				success: function (data) {
					this.byId("epsTable").setModel(new JSONModel(data));
				},
				error: function (err) {
					this._toast("fetchError");
					console.log(err.message);
				}
			});
		},

		onAddButtonPress: function () {
			this.navTo("seriesCreation");
		},

		onSaveSeriesButtonPress: function () {
			const model = this.getView().getModel();
			const newSeriesModel = this.byId("seriesCreationForm").getModel();

			// input validation
			// TODO

			// save series
			model.create("/Serie", newSeriesModel.getData(), {
				success: function () {
					this._toast("seriesCreationSuccessMsg");
				},
				error: function (err) {
					this._toast("seriesCreationErrorMsg");
					console.log(err.message);
				}
			});

			// save episodes
			// TODO
		},

		onSaveEpButtonPress: function () {
			const newEpisodeModel = this.byId("episodeCreationForm").getModel();
			const newEpisodesModel = this.byId("episodesCreationTable").getModel();
			const newEpisode = newEpisodeModel.getData();
			const newEpisodes = newEpisodesModel.getData();

			// input validation
			this._assertNotBlank(newEpisode.number); // TODO validate number
			this._assertNotBlank(newEpisode.season);
			this._assertNotBlank(newEpisode.title);
			this._assertNotBlank(newEpisode.producer);

			// push the episode to the table's model
			newEpisodes.episodes.push(newEpisode);
			newEpisodesModel.refresh();

			// reset the form
			newEpisodeModel.setData({});
		},

		onRemoveEpsButtonPress: function (ev) {
			const table = this.byId("episodesCreationTable");
			const newEpsModel = table.getModel();
			const newEps = newEpsModel.getData();

			const indexes = table.getSelectedItems()
				.map(it => it.getBindingContextPath().substringAfterLast('/'));

			for (let i = newEps.episodes.length - 1; i >= 0; --i) {
			    if (indexes.includes(i.toString()))
			        newEps.episodes.splice(i, 1);
			}
			
			table.removeSelections(true);
			newEpsModel.refresh();
		},

		onEditButtonPress: function () {
			//  const seriesModel = this.byId("seriesCreationForm").getModel();
			MessageToast.show("Not implemented");
		},

		onDeleteButtonPress: function () {
			MessageToast.show("Not implemented");
		},

		onTestButtonPress: function () {
			this.navTo("seriesDetail");
		},

		_bindModels: function () {
			// main odata model
			const model = new ODataModel("/core/serie.xsodata");
			model.read("/Serie", {
				async: true,
				success: function (data) {
					this.byId("seriesList").setModel(new JSONModel(data));
				},
				error: function (err) {
					console.log(err.message);
				}
			});

			// model for the series creation form
			const newSeries = new JSONModel({
				title: null,
				genre: null,
				date: null
			});
			this.byId("seriesCreationForm").setModel(newSeries);

			// model for the episode creation form
			const newEpisode = new JSONModel({
				number: null,
				season: null,
				title: null,
				producer: null
			});
			this.byId("episodeCreationForm").setModel(newEpisode);

			// model for the episodes creation table
			const newEpisodes = new JSONModel({
				episodes: []
			});
			this.byId("episodesCreationTable").setModel(newEpisodes);
		},

		_toast: function (i18nProperty) {
			MessageToast.show(this._i18n(i18nProperty));
		},

		_i18n: function (property) {
			return this.getView().getModel("i18n").getProperty(property);
		},

		_assertNotBlank: function (string) {
			if (!string || string.isBlank()) {
				this._toast("blankInputError");
				throw Error("String cannot be blank");
			}
		}
	});
});