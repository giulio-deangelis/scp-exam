/* eslint-env es6 */

/* Utility class for shallow and deep object comparison */
sap.ui.define([], function () {
	"use strict";
	return {
		constructor: function () {},

        /*
         * Perform a shallow object comparison. Does not work if the
         * objects have an array property.
         * @return true if the objects's properties are identical,
         *         false otherwise
         */
		shallowEquals: function (obj1, obj2) {
			if (!this.isObject(obj1) || !this.isObject(obj2))
				return obj1 === obj2;

			const keys = Object.keys(obj1);

			if (keys.length !== Object.keys(obj2).length)
				return false;

			for (const key of keys) {
				if (obj1[key] !== obj2[key])
					return false;
			}

			return true;
		},

        /*
         * Perform a deep object comparison.
         * @return true if the objects are identical, false otherwise
         */
		deepEquals: function (obj1, obj2) {
			if (!this.isObject(obj1) || !this.isObject(obj2))
				return obj1 === obj2;

			const keys = Object.keys(obj1);

			if (keys.length !== Object.keys(obj2).length)
				return false;

			for (const key of keys) {
				if (!this.deepEquals(obj1[key], obj2[key]))
					return false;
			}

			return true;
		},

		isObject: function (obj) {
			return obj !== null && typeof obj === "object";
		}
	};
});