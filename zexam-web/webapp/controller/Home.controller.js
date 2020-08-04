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
		    this._currentSeriesId = null;
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
				success: function (data) {
					for (const ep of data.results) ep.regista = producer;
					that.byId("epsTable").setModel(new JSONModel(data));
				},
				error: function (err) {
					that._toast("fetchError");
					console.log(err.message);
				}
			});
		},

		onAddButtonPress: function () {
			this.navTo("seriesCreation");
			this._currentSeriesId = null;
		},
		
		onEditButtonPress: function () {
			this._currentSeriesId = this.byId("seriesDetailsForm")
			    .getBindingContext()
			    .getObject()
			    .titoloSerie;
			    
			this.navTo("seriesCreation");
		},

		onSaveSeriesButtonPress: function (ev) {
// 			const that = this;
// 			const model = this.getView().getModel();
// 			const newSeriesModel = this.byId("seriesCreationForm").getModel();
// 			const newEpsModel = this.byId("episodesCreationTable").getModel();
// 			const seriesId = newSeriesModel.getData().titoloSerie;
// 			const episodesPath = "/Serie('" + seriesId + "')/Puntate";

			/* Logica di procedimento:
			 * Quando currentSeriesId è null, allora l'operazione corrente è di create,
			 * mentre se è definito sarà un'operazione di update.
			 * L'operazione di create andrà a fare un batch di create sull'odata
			 * utilizzando gli appositi metodi di batch, creando sia le serie
			 * che gli episodi associati a quella serie.
			 * L'operazione di update invece andrà prima di tutto a tenere un riferimento
			 * degli episodi originali e di compararli alla lista degli episodi modificata
			 * dall'utente. Quando un episodio esiste nella nuova lista ma non è presente
			 * nella vecchia, allora si farà un'operazione di create, mentre se un episodio
			 * esiste nella vecchia ma non nella nuova, allora si farà una delete.
			 * Nella validazione bisogna vietare duplicati.
		     */

            if (this._currentSeriesId !== null)
                this._updateSeries();
            else this._createSeries();

			// input validation
			// TODO

// 			model.create("/Serie", newSeriesModel.getData(), {
// 				async: true,
// 				success: function () {
// 					that._toast("seriesCreationSuccessMsg");
// 					// save episodes
// 					model.create(episodesPath, newEpsModel.getData().episodi[0], {
// 						async: true,
// 						success: function () {
// 						    that._toast("episodesCreationSuccessMsg")
// 						},
// 						error: function (err) {
// 						    that._toast("episodesCreationErrorMsg");
// 							console.log("Failed to create episodes");
// 						}
// 					});
// 				},
// 				error: function (err) {
// 					that._toast("seriesCreationErrorMsg");
// 					console.log(err.message);
// 				}
// 			});
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

			for (let i = newEps.episodes.length - 1; i >= 0; --i) {
				if (indexes.includes(i.toString()))
					newEps.episodes.splice(i, 1);
			}

			table.removeSelections(true);
			newEpsModel.refresh();
		},

		onDeleteButtonPress: function () {
			MessageToast.show("Not implemented");
		},
		
		_createSeries: function () {
		    
		},
		
		_updateSeries: function() {
		    
		},
		
		_deleteSeries: function() {
		    
		},

		_bindModels: function () {
			// main odata model
			const model = new ODataModel("/core/serie.xsodata");
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
				anno: null
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