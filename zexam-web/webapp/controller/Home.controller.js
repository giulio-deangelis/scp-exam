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
            /* Nota: si può passare una payload al metodo toDetail
             * che verrà reso disponibile nell'evento "beforeShow"
             * della Page di dettaglio. In questo modo si può risparmiare
             * su qualche variabile globale.
             * https://sapui5.hana.ondemand.com/#/api/sap.m.SplitContainer%23methods/toDetail
             */
        },

        onSeriesPress: function (ev) {
            const that = this;
            const context = ev.getParameter("listItem").getBindingContext();
            const id = context.getObject().titoloSerie.replaceAll(" ", "%20");
            const path = `/Serie('${id}')/Puntate`;
            const producer = context.getObject().regista;

            this.navTo("seriesDetail");

            // bind the series form
            const form = this.byId("seriesDetailsForm");
            form.setModel(context.getModel());
            form.bindElement(context.getPath());

            // bind the episodes table
            this.getView().getModel().read(path, {
                async: true,
                urlParameters: {
                    "$orderby": "stagione,episodio"
                },
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
            const seriesTitle = this.byId("seriesCreationForm").getModel().getData().titoloSerie;

            this._trimStrings(newEpisode);

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

            newEpisode["Serie.titoloSerie"] = seriesTitle;

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
            this._deleteSeries();
        },

        _createSeries: function () {
            const that = this;
            const model = this.getView().getModel();
            const newSeries = this.byId("seriesCreationForm").getModel().getData();
            const newEpisodes = this.byId("episodesCreationTable").getModel().getData();
            const batchId = "series";

            model.setDeferredGroups([batchId]);

            this._trimStrings(newSeries);

            // validate the series
            if (!this._validateSeries(newSeries))
                return;

            // create the series
            model.create("/Serie", newSeries, { groupId: batchId });

            // create its episodes
            for (const episodio of newEpisodes.episodi) {
                episodio["Serie.titoloSerie"] = newSeries.titoloSerie;
                model.create("/Puntata", episodio, { groupId: batchId });
            }

            model.submitChanges({
                groupId: batchId,
                success: function (data, res) {
                    if (that._isError(res.body)) {
                        that._error("seriesCreationError");
                    } else {
                        that._toast("seriesCreationSuccess");
                        that._refreshModel();
                        that.navTo("welcome");
                    }
                },
                error: function (err) {
                    that._error("seriesCreationError");
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
            const seriesTitle = originalSeries.titoloSerie;

            // assign a group id for the batch request
            const batchId = "series";
            this.getView().getModel().setDeferredGroups([batchId]);

            // trigger an update on the series only if the user changes one of its fields
            if (!Comparator.shallowEquals(originalSeries, updatedSeries)) {
                updatedSeries.titoloSerie = undefined; // disallow title update since it's not possible
                model.update(this._getSeriesPath(seriesTitle), updatedSeries, { groupId: batchId });
            }

            // create any new episodes and update those that were modified
            for (const episode of updatedEpisodes) {
                const index = originalEpisodes.findIndex(ep =>
                    ep.episodio === episode.episodio
                    && ep.stagione === episode.stagione
                );
                if (index < 0) { // create the new episode
                    model.create("/Puntata", episode, { groupId: batchId });
                } else { // update only if something was modified
                    const ep = originalEpisodes[index];
                    if (ep.stagione !== episode.stagione || ep.regista !== episode.regista) {
                        const path = this._getEpisodePath(seriesTitle, episode.titoloPuntata);
                        model.update(path, episode, { groupId: batchId });
                    }
                }
            }

            // delete all the episodes that the user removed
            for (const original of originalEpisodes) {
                const index = updatedEpisodes.findIndex(ep =>
                    ep.episodio === original.episodio
                    && ep.stagione === original.stagione
                );
                if (index < 0) {
                    const path = this._getEpisodePath(seriesTitle, original.titoloPuntata);
                    model.remove(path, { groupId: batchId });
                }
            }

            // trigger the batch request
            model.submitChanges({
                groupId: batchId,
                success: function (data, res) {
                    if (!res) return; // there were no changes
                    if (that._isError(res.body)) {
                        that._error("seriesUpdateError");
                    } else {
                        that._toast("seriesUpdateSuccess");
                        that._refreshModel();
                        // TODO navigate back and update the details
                    }
                },
                error: function (err) {
                    that._error("seriesUpdateError");
                }
            });
        },

        _deleteSeries: function () {
            const that = this;
            const model = this.getView().getModel();
            const seriesTitle = this._currentSeries.titoloSerie;
            const batchId = "series";

            model.setDeferredGroups([batchId]);

            model.remove(`/Serie('${seriesTitle}')`, { groupId: batchId });
            for (const ep of this._currentEpisodes.episodi) {
                model.remove(this._getEpisodePath(seriesTitle, ep.titoloPuntata), {
                    groupId: batchId
                });
            }

            model.submitChanges({
                groupId: batchId,
                async: true,
                success: function (data, res) {
                    if (that._isError(res.body)) {
                        that._error("seriesDeletionError");
                    } else {
                        that._toast("seriesDeletionSuccess");
                        that.navTo("welcome");
                        that._refreshModel();
                    }
                },
                error: function (err) {
                    that._error("seriesDeletionError");
                }
            });
        },

        _bindModels: function () {
            // main odata model
            const model = new ODataModel("/core/xsodata/serie.xsodata", {
                defaultUpdateMethod: sap.ui.model.odata.UpdateMethod.Put
            });

            this.getView().setModel(model);
            this._refreshModel();

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

        _refreshModel: function () {
            const that = this;
            const model = this.getView().getModel();
            model.read("/Serie", {
                async: true,
                success: function (data, res) {
                    if (that._isError(res.body))
                        that._error("fetchError");
                    else that.byId("seriesList").setModel(new JSONModel(data));
                },
                error: function (err) {
                    that._error("fetchError");
                }
            });
        },

        _getEpisodePath: function (titoloSerie, titoloPuntata) {
            return `/Puntata(Serie.titoloSerie='${titoloSerie}',titoloPuntata='${titoloPuntata}')`;
        },

        _getSeriesPath: function (titoloSerie) {
            return `/Serie('${titoloSerie}')`;
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
            const alphanum60 = /^.{1,60}$/;
            const integer = /\d/;
            return {
                titoloSerie: alphanum60,
                genere: alphanum60,
                anno: /^[12][09]\d{2}$/,
                regista: alphanum60,
                titoloPuntata: alphanum60,
                stagione: integer,
                episodio: integer
            };
        },

        _trimStrings: function (obj) {
            for (const key of Object.keys(obj)) {
                const prop = obj[key];
                if (typeof prop === "string")
                    obj[key] = prop.trim();
            }
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