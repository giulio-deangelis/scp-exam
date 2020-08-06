$.import("xsjs", "convert");
"use strict"

const convert = $.xsjs.convert;

const alphanumRegex = /^.{1,60}$/;
const regex = {
    titoloSerie: alphanumRegex,
    genere: alphanumRegex,
    anno: /^[12][09]\d{2}$/,
    regista: alphanumRegex
};

function update(params) {
    // get the new data
    let query = `select * from "${params.afterTableName}"`;
    let ps = params.connection.prepareStatement(query);
    let rs = ps.executeQuery();
    const newSerie = convert.recordSetToJSON(rs, "serie").serie[0];
    ps.close();
    
    // validate data
    if (!newSerie.titoloSerie || !regex.titoloSerie.test(newSerie.titoloSerie))
        throw "Invalid series title";
    if (!newSerie.genere || !regex.genere.test(newSerie.genere))
        throw "Invalid genre";
    if (!newSerie.anno || !regex.anno.test(newSerie.anno))
        throw "Invalid year";
    if (!newSerie.regista || !regex.regista.test(newSerie.regista))
        throw "Invalid producer";
    
    // then try to update the database
    query = `
        update "Serie" set
          "genere" = ?,
          "anno" = ?,
          "regista" = ?
        where "titoloSerie" = ?
    `;
    
    ps = params.connection.prepareStatement(query);
    ps.setString(1, newSerie.genere);
    ps.setString(2, newSerie.anno);
    ps.setString(3, newSerie.regista);
    ps.setString(4, newSerie.titoloSerie);
    ps.executeUpdate(query);
    ps.close();
}