/* eslint-env es6 */
/* eslint no-console: 0, no-warning-comments: 0 */

// global debugging object accessible via console
const debug = {};

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

    /* Models
    
        Serie = {
            titoloSerie: string,
            genere: string,
            anno: integer,
            puntate: ODataModel,
            voti: ODataModel
        }
        
        Puntata = {
            "Serie.titoloSerie": string,
            titoloPuntata: string,
            episodio: integer,
            stagione: integer
        }
        
        Voto = {
            titoloSerie: string,
            utente: string,
            voto: integer
        }
    */

    /* OData Paths

        /Serie : all series
        /Puntata : all episodes
        /Voti : all votes

        /Serie('<titoloSerie>') : specific series
        /Puntata(titoloSerie='',titoloPuntata='') : specific episode
        /Voto(titoloSerie='',utente='') : specific vote

        /Serie('<titoloSerie>')/Voti : series' votes
        /Serie('<titoloSerie>')/Puntate : series' episodes
    */

    // the ODataModel
    let serie = null;
    const odataPath = "/core/xsodata/serie.xsodata"
    const updateMethod = sap.ui.model.odata.UpdateMethod.Put
    
    // the series editor data
    const EditorData = function (data) {
        if (data) {
            this.serie = data.serie;
            this.puntata = data.puntata;
            this.puntate = data.puntate;
        } else {
            this.serie = {};
            this.puntata = {};
            this.puntate = [];
        }
    }
    const editor = new JSONModel();

    // the groupId for batch operations
    const groupId = "1";
    
    // to know whether the user is editing an existing series or creating a new one
    let editing = false;

    return Controller.extend("zexam.zexam-web.controller.Home", {

        onInit: function () {
            this._regex = this._createRegex();

            serie = new ODataModel(odataPath, {
                defaultUpdateMethod: updateMethod
            });
            
            serie.setDeferredGroups([groupId]);
            
            // bind the main model
            this.getView().setModel(serie);
            
            // bind the series creation page models
            this.byId("seriesCreationForm").setModel(editor);
            this.byId("episodeCreationForm").setModel(editor);
            this.byId("episodesCreationTable").setModel(editor);
            
            this._readSerie();
            
            this._setupDebugObject();
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
            const context = ev.getParameter("listItem").getBindingContext();

            // bind the series form and the episodes table
            this.byId("seriesDetailsForm").bindElement(context.getPath());
            this.byId("episodesTable").bindElement(context.getPath());
            
            this.navTo("seriesDetail");
        },

        onAddButtonPress: function () {
            editor.setData(new EditorData());
            editing = false;
            this.navTo("seriesCreation");
        },

        onEditButtonPress: function () {
            const data = editor.getData();
            
            data.serie = Object.assign({}, this._getCurrentSerie());
            data.puntata = {};
            data.puntate = this._getCurrentPuntate().slice();
            editor.refresh();
            editing = true;
            
            this.navTo("seriesCreation");
        },

        onSaveSeriesButtonPress: function (ev) {
            if (editing) this._updateSeries();
            else this._createSeries();
        },

        onSaveEpButtonPress: function () {
            const newPuntata = editor.getData().puntata;
            const puntate = editor.getData().puntate;
            this._trimStrings(newPuntata);

            // input validation
            if (!this._validatePuntata(newPuntata))
                return;

            // check duplicates
            for (const puntata of puntate) {
                if (puntata.episodio === newPuntata.episodio
                    || puntata.stagione === newPuntata.stagione) {
                    this._error("duplicateEpisode");
                    return;
                }
            }

            // put the primary key inside the episode
            newPuntata["Serie.titoloSerie"] = editor.getData().serie.titoloSerie;

            // push the episode to the table's model
            puntate.push(Object.assign({}, newPuntata)); // clone to avoid overriding
            editor.getData().puntata = {};
            editor.refresh();
        },

        onRemoveEpsButtonPress: function (ev) {
            const table = this.byId("episodesCreationTable");
            const puntate = editor.getData().puntate;

            const indexes = table.getSelectedItems()
                .map(it => it.getBindingContextPath().substringAfterLast("/"));

            for (let i = puntate.length - 1; i >= 0; --i) {
                if (indexes.includes(i.toString()))
                    puntate.splice(i, 1);
            }

            table.removeSelections(true);
            editor.refresh();
        },

        onDeleteButtonPress: function () {
            this._deleteSeries();
        },
        
        _readSerie: function () {
            const that = this;
            serie.read("/Serie", {
                async: true,

                success: function (data, res) {
                    if (that._isError(res.body))
                        that._error("fetchError");
                },

                error: function (err) {
                    that._error("fetchError");
                }
            });
        },

        _createSeries: function () {
            const that = this;
            const newSerie = editor.getData().serie;
            const newPuntate = editor.getData().puntate;

            this._trimStrings(newSerie);

            // validate the series
            if (!this._validateSerie(newSerie))
                return;

            // create the series
            serie.create("/Serie", newSerie, { groupId: groupId });

            // create its episodes
            for (const puntata of newPuntate) {
                puntata["Serie.titoloSerie"] = newSerie.titoloSerie;
                serie.create("/Puntata", puntata, { groupId: groupId });
            }

            serie.submitChanges({
                groupId: groupId,
                success: function (data, res) {
                    if (that._isError(res.body)) {
                        that._error("seriesCreationError");
                    } else {
                        that._toast("seriesCreationSuccess");
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
            
            // the new series info and episodes changed by the user
            const oldSerie = this._getCurrentSerie();
            const oldPuntate = this._getCurrentPuntate();
            const newSerie = editor.getData().serie;
            const newPuntate = editor.getData().puntate;

            // trigger an update on the series only if the user changes one of its fields
            if (!Comparator.shallowEquals(oldSerie, newSerie)) {
                newSerie.titoloSerie = undefined; // disallow title update since it's not possible
                serie.update(this._getSeriesPath(oldSerie.titoloSerie), newSerie, { groupId: groupId });
            }

            // create any new episodes and update those that were modified
            for (const puntata of newPuntate) {
                const index = oldPuntate.findIndex(p =>
                    p.episodio === puntata.episodio
                    && p.stagione === puntata.stagione
                );
                if (index < 0) { // create the new episode
                    serie.create("/Puntata", puntata, { groupId: groupId });
                } else { // update only if something was modified
                    const p = oldPuntate[index];
                    if (p.stagione !== puntata.stagione || p.regista !== puntata.regista) {
                        const path = this._getEpisodePath(oldSerie.titoloSerie, puntata.titoloPuntata);
                        serie.update(path, puntata, { groupId: groupId });
                    }
                }
            }

            // delete all the episodes that the user removed
            for (const puntata of oldPuntate) {
                const index = newPuntate.findIndex(p =>
                    p.episodio === puntata.episodio
                    && p.stagione === puntata.stagione
                );
                if (index < 0) {
                    const path = this._getEpisodePath(oldSerie.titoloSerie, puntata.titoloPuntata);
                    serie.remove(path, { groupId: groupId });
                }
            }

            // trigger the batch request
            serie.submitChanges({
                groupId: groupId,
                success: function (data, res) {
                    if (!res) return; // there were no changes
                    if (that._isError(res.body)) {
                        that._error("seriesUpdateError");
                    } else {
                        that._toast("seriesUpdateSuccess");
                        that.navTo("seriesDetail"); 
                    }
                },
                error: function (err) {
                    that._error("seriesUpdateError");
                }
            });
        },

        _deleteSeries: function () {
            const that = this;
            const currentSerie = this._getCurrentSerie();
            const currentPuntate = this._getCurrentPuntate();
            const titoloSerie = currentSerie.titoloSerie;

            serie.remove(`/Serie('${titoloSerie}')`, { groupId: groupId });
            for (const puntata of currentPuntate) {
                serie.remove(this._getEpisodePath(titoloSerie, puntata.titoloPuntata), {
                    groupId: groupId
                });
            }

            serie.submitChanges({
                groupId: groupId,
                async: true,

                success: function (data, res) {
                    if (that._isError(res.body)) {
                        that._error("seriesDeletionError");
                    } else {
                        that._toast("seriesDeletionSuccess");
                        that.navTo("welcome");
                    }
                },

                error: function (err) {
                    that._error("seriesDeletionError");
                }
            });
        },

        _getEpisodePath: function (titoloSerie, titoloPuntata) {
            const escapedTitoloSerie = titoloSerie.replaceAll(" ", "%20");
            const escapedTitoloPutnata = titoloPuntata.replaceAll(" ", "%20");
            return `/Puntata(Serie.titoloSerie='${escapedTitoloSerie}',titoloPuntata='${escapedTitoloPuntata}')`;
        },

        _getSeriesPath: function (titoloSerie) {
            return `/Serie('${titoloSerie.replaceAll(" ", "%20")}')`;
        },
        
        _getCurrentSerie: function () {
            return this.byId("seriesDetailsForm")
                .getBindingContext()
                .getObject();
        },
        
        _getCurrentPuntate: function () {
            return this.byId("episodesTable")
                .getItems()
                .map(item => item.getBindingContext().getObject());
        },

        _validatePuntata: function (episode) {
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

        _validateSerie: function (series) {
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
        },
        
        _setupDebugObject: function () {
            debug.controller = this;
            debug.serie = serie;
            debug.editor = editor;
        }
    });
});