/* eslint-env es6 */
/* eslint no-console: 0, no-warning-comments: 0 */

sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/json/JSONModel",
    "../util/Comparator",
    "../util/extensions/String"
], function (
    Controller,
    MessageToast,
    MessageBox,
    ODataModel,
    JSONModel,
    Comparator
) {
    "use strict";

    return Controller.extend("zexam.zexam-web.controller.Home", {

        onInit: function () {
            this._currentSeries = null;
            this._currentEpisodes = null;
            this._regex = this._createRegex();
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
                    that._error("fetchError");
                    console.error(err);
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
            this.byId("seriesCreationForm").getModel().setData({});
            this.byId("episodesCreationTable").getModel().setData({ episodi: [] });
        },

        onEditButtonPress: function () {
            this.navTo("seriesCreation");

            // clone the current series and episodes to allow the user to edit while keeping the originals
            const currentSeriesCopy = Object.assign({}, this._currentSeries);
            const currentEpisodesCopy = { episodi: this._currentEpisodes.episodi.slice() };

            // copy data from the details to the creation form
            this.byId("seriesCreationForm").getModel().setData(currentSeriesCopy);

            // do the same for the episodes table
            const episodesCreationModel = this.byId("episodesCreationTable").getModel();
            episodesCreationModel.setData(currentEpisodesCopy);
            episodesCreationModel.refresh();
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
            if (!this._validateEpisode(newEpisode))
                return;

            // check duplicates
            for (const ep of newEpisodes.episodi) {
                if (ep.episodio === newEpisode.episodio
                    || ep.titoloPuntata === newEpisode.titoloPuntata) {
                    this._error("duplicateEpisode");
                    return;
                }
            }

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

            // validate the series
            if (!this._validateSeries(newSeriesModel.getData()))
                return;

            // create the series
            model.create("/Serie", newSeriesModel.getData(), { groupId: batchId });

            // create its episodes
            for (const episodio of newEpsModel.getData().episodi) {
                episodio["Serie.titoloSerie"] = seriesId;
                model.create("/Puntata", episodio, { groupId: batchId });
            }

            model.submitChanges({
                groupId: batchId,
                success: function (data) {
                    that._toast("seriesCreationSuccess");
                },
                error: function (err) {
                    that._error("seriesCreationError");
                    console.error(err);
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

            // trigger an update on the series only if the user changes one of its fields
            if (!Comparator.shallowEquals(originalSeries, updatedSeries)) {
                model.update(this._getSeriesPath(currentSeriesTitle), updatedSeries, { groupId: batchId });
                currentSeriesTitle = updatedSeries.titoloSerie; // update the title in case it was modified
            }

            // create any new episodes and update those that were modified
            for (const episode of updatedEpisodes) {
                const index = originalEpisodes.findIndex(ep =>
                    ep.episodio === episode.episodio
                    && ep.titoloPuntata === episode.titoloPuntata
                );
                if (index < 0) { // create the new episode
                    model.create("/Puntata", episode, { groupId: batchId });
                } else { // update only if something was modified
                    const ep = originalEpisodes[index];
                    if (ep.stagione !== episode.stagione || ep.regista !== episode.regista) {
                        const path = this._getEpisodePath(currentSeriesTitle, episode.titoloPuntata);
                        model.update(path, episode, { groupId: batchId });
                    }
                }
            }

            // delete all the episodes that the user removed
            for (const original of originalEpisodes) {
                const index = updatedEpisodes.findIndex(ep =>
                    ep.episodio === original.episodio
                    && ep.titoloPuntata === original.titoloPuntata
                );
                if (index < 0) {
                    const path = this._getEpisodePath(currentSeriesTitle, original.titoloPuntata);
                    model.remove(path, { groupId: batchId });
                }
            }

            // trigger the batch request
            model.submitChanges({
                groupId: batchId,
                success: function (data, res) {
                    if (that._isError(res.body))
                        that._error("seriesUpdateError");
                    else that._toast("seriesUpdateSuccess");
                },
                error: function (err) {
                    that._error("seriesUpdateError");
                    console.error(err);
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

        _validateEpisode: function (episode) {
            // TODO let the user know which inputs are invalid
            if (this._regex.titoloPuntata.test(episode.titoloPuntata)
                && this._regex.episodio.test(episode.episodio)
                && this._regex.stagione.test(episode.stagione)
                && this._regex.regista.test(episode.regista)) {
                return true;
            }
            this._error("invalidEpisode");
            return false;
        },

        _validateSeries: function (series) {
            // TODO let the user know which inputs are invalid
            if (this._regex.titoloSerie.test(series.titoloSerie)
                && this._regex.genere.test(series.genere)
                && this._regex.anno.test(series.anno)
                && this._regex.regista.test(series.regista)) {
                return true;
            }
            this._error("invalidSeries");
            return false;
        },

        _createRegex: function () {
            const alphanum60 = new RegExp("^.{1,60}$");
            const integer = new RegExp("\\d");
            return {
                titoloSerie: alphanum60,
                genere: alphanum60,
                anno: new RegExp("^[12][09]\\d{2}$"),
                regista: alphanum60,
                titoloPuntata: alphanum60,
                stagione: integer,
                episodio: integer
            };
        },

        _isError: function (body) {
            // temporary way to check if a response is an error
            return body.includes("error");
        },

        _toast: function (i18nProperty) {
            MessageToast.show(this._i18n(i18nProperty));
        },
        
        _error: function (i18nProperty) {
            MessageBox.error(this._i18n(i18nProperty), {
                title: this._i18n("error")
            });
        },

        _i18n: function (property) {
            return this.getView().getModel("i18n").getProperty(property);
        }
    });
});