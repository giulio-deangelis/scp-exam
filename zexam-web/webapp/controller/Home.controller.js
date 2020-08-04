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
			this._currentSeries = null;
			this._currentEpisodes = null;
			this._bindModels();
		},

		navTo: function (id) {
			this.byId("splitter").toDetail(this.createId(id));
		},

		onSeriesPress: function (ev) {
			const that = this;
			const context = ev.getParameter("listItem").getBindingContext();
			const id = context.getObject().titoloSerie.replace(" ", "%20");
			const path = "/Serie('" + id + "')/Puntate";
			const producer = context.getObject().regista;

			this.navTo("seriesDetail");

			// bind the series form
			const form = this.byId("seriesDetailsForm");
			form.setModel(context.getModel());
			form.bindElement(context.getPath());

			// bind the episodes table
			this.getView().getModel().read(path, {
				async: true,
				success: function (data) {
					for (const ep of data.results) ep.regista = producer;
					that.byId("episodesTable").setModel(new JSONModel(data));
					// keep a reference to the currently viewed episodes
					that._currentEpisodes = {
						episodi: data.results
					};
				},
				error: function (err) {
					that._toast("fetchError");
					console.log(err.message);
				}
			});

			// keep a reference to the currently viewed series
			const modelData = this.byId("seriesDetailsForm")
				.getBindingContext()
				.getObject();
			this._currentSeries = {
			    titoloSerie: modelData.titoloSerie,
				genere: modelData.genere,
				anno: modelData.anno,
				regista: modelData.regista
			};
		},

		onAddButtonPress: function () {
			this.navTo("seriesCreation");
			this._currentSeries = null;
			this._currentEpisodes = null;
		},

		onEditButtonPress: function () {
			this.navTo("seriesCreation");

			const currentSeriesCopy = Object.assign({}, this._currentSeries);
			const currentEpisodesCopy = Object.assign({}, this._currentEpisodes);

			// copy data from the details to the creation form
			this.byId("seriesCreationForm").getModel().setData(currentSeriesCopy);

			// do the same for the episodes table
			const episodesCreationModel = this.byId("episodesCreationTable").getModel();
			episodesCreationModel.setData(currentEpisodesCopy);
			episodesCreationModel.refresh(true);
		},

		onSaveSeriesButtonPress: function (ev) {
			if (this._currentSeries !== null)
				this._updateSeries();
			else this._createSeries();
		},

		onSaveEpButtonPress: function () {
			const newEpisodeModel = this.byId("episodeCreationForm").getModel();
			const newEpisodesModel = this.byId("episodesCreationTable").getModel();
			const newEpisode = newEpisodeModel.getData();
			const newEpisodes = newEpisodesModel.getData();

			// input validation
			this._assertNotBlank(newEpisode.episodio); // TODO validate number
			this._assertNotBlank(newEpisode.stagione);
			this._assertNotBlank(newEpisode.titoloPuntata);
			this._assertNotBlank(newEpisode.regista);

			// check duplicates
			// TODO

			// push the episode to the table's model
			newEpisodes.episodi.push(newEpisode);
			newEpisodesModel.refresh();

			// reset the form
			newEpisodeModel.setData({});
		},

		onRemoveEpsButtonPress: function (ev) {
			const table = this.byId("episodesCreationTable");
			const newEpsModel = table.getModel();
			const newEps = newEpsModel.getData();

			const indexes = table.getSelectedItems()
				.map(it => it.getBindingContextPath().substringAfterLast("/"));

			for (let i = newEps.episodi.length - 1; i >= 0; --i) {
				if (indexes.includes(i.toString()))
					newEps.episodi.splice(i, 1);
			}

			table.removeSelections(true);
			newEpsModel.refresh();
		},

		onDeleteButtonPress: function () {
			MessageToast.show("Not implemented");
		},

		_createSeries: function () {
			const that = this;
			const model = this.getView().getModel();
			const newSeriesModel = this.byId("seriesCreationForm").getModel();
			const newEpsModel = this.byId("episodesCreationTable").getModel();
			const seriesId = newSeriesModel.getData().titoloSerie;
			const batchId = "series";

			model.setDeferredGroups([batchId]);

			// create series
			model.create("/Serie", newSeriesModel.getData(), { groupId: batchId });

			// create episodes
			for (const episodio of newEpsModel.getData().episodi) {
				episodio["Serie.titoloSerie"] = seriesId;
				model.create("/Puntata", episodio, { groupId: batchId });
			}

			model.submitChanges({
				groupId: batchId,
				success: function (data) {
					that._toast("seriesCreationSuccessMsg");
				},
				error: function (err) {
					that._toast("seriesCreationErrorMsg");
					console.log(err.message);
				}
			});
		},

		_updateSeries: function () {
			const that = this;
			const model = this.getView().getModel();

			// the series and episodes prior to the user's changes
			const originalSeries = this._currentSeries;
			const originalEpisodes = this._currentEpisodes.episodi;

			// the new series info and episodes changed by the user
			const updatedSeries = this.byId("seriesCreationForm").getModel().getData();
			const updatedEpisodes = this.byId("episodesCreationTable").getModel().getData().episodi;

			// this will change if the user updates the series' title, and will be used to update its episodes
			let currentSeriesTitle = originalSeries.titoloSerie;

			// assign a group id for the batch request
			const batchId = "series";
			this.getView().getModel().setDeferredGroups([batchId]);

			// helper function that checks whether the given array contains the episode
			const containsEpisode = function (episodes, episode) {
				return episodes.findIndex(ep => {
					if (ep.episodio === episode.episodio
					        || ep.titoloPuntata === episode.titoloPuntata) {
						return true;
					}
					return false;
				}) >= 0;
			};

			// trigger an update on the series only if the user changes one of its fields
			if (updatedSeries.titoloSerie !== this._currentSeries.titoloSerie
			        || updatedSeries.anno !== this._currentSeries.anno
			        || updatedSeries.genere !== this._currentSeries.genere) {
				model.update(this._getSeriesPath(currentSeriesTitle), updatedSeries, { groupId: batchId });
				currentSeriesTitle = updatedSeries.titoloSerie; // update the title in case it was modified
			}

// 			// create any new episodes and update those that were modified
// 			for (const episode of updatedEpisodes) {
// 				const path = this._getEpisodePath(currentSeriesTitle, episode.titoloPuntata);
// 				if (containsEpisode(originalEpisodes, episode))
// 					model.update(path, episode, { groupId: batchId });
// 				else model.create("/Puntata", episode, { groupId: batchId });
// 			}

			// delete all the episodes that the user removed
			for (const episode of originalEpisodes) {
				if (!containsEpisode(updatedEpisodes, episode)) {
					const path = this._getEpisodePath(currentSeriesTitle, episode.titoloPuntata);
					model.remove(path, { groupId: batchId });
				}
			}

			// trigger the batch request
			model.submitChanges({
				groupId: batchId,
				success: function () {
					that._toast("seriesUpdateSuccessMsg");
				},
				error: function (err) {
					that._toast("seriesUpdateErrorMsg");
					console.log(err);
				}
			});
		},

		_deleteSeries: function () {

		},

		_bindModels: function () {
			// main odata model
			const model = new ODataModel("/core/serie.xsodata", {
			    defaultUpdateMethod: sap.ui.model.odata.UpdateMethod.Put
			});
			
			this.getView().setModel(model);
			model.read("/Serie", {
				async: true,
				urlParameters: {
					"$format": "json"
				},
				success: function (data) {
					this.byId("seriesList").setModel(new JSONModel(data));
				}.bind(this),
				error: function (err) {
					console.log(err.message);
				}
			});

			// model for the series creation form
			const newSeries = new JSONModel({
				titoloSerie: null,
				genere: null,
				anno: null,
				regista: null
			});
			this.byId("seriesCreationForm").setModel(newSeries);

			// model for the episode creation form
			const newEpisode = new JSONModel({
				episodio: null,
				stagione: null,
				titoloPuntata: null,
				regista: null
			});
			this.byId("episodeCreationForm").setModel(newEpisode);

			// model for the episodes creation table
			const newEpisodes = new JSONModel({
				episodi: []
			});
			this.byId("episodesCreationTable").setModel(newEpisodes);
		},

		_getEpisodePath: function (titoloSerie, titoloPuntata) {
			return "/Puntata(Serie.titoloSerie='" + titoloSerie + "',titoloPuntata='" + titoloPuntata + "')";
		},
		
		_getSeriesPath: function (titoloSerie) {
		    return "/Serie('" + titoloSerie + "')";
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