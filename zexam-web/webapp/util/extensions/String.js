/* eslint-env es6 */

/* Example of how prototypes could be extended */
sap.ui.define([], function () {
	$.extend(String.prototype, {

		isBlank: function () {
			for (const c of this)
				if (c !== ' ') return false;
			return true;
		},

		capitalize: function () {
			return this.substring(0, 1).toUpperCase() + this.substring(1);
		},

		decapitalize: function () {
			return this.substring(0, 1).toLowerCase() + this.substring(1);
		},

		substringBefore: function (delimiter, startPos) {
			const pos = startPos || 0;
			const start = this.indexOf(delimiter, pos);
			if (start < 0) return this.substring(pos);
			return this.substring(pos, start);
		},

		substringAfter: function (delimiter, startPos) {
			const pos = startPos || 0;
			const start = this.indexOf(delimiter, pos);
			if (start < 0) return this.substring(pos);
			return this.substring(start + 1);
		},

		substringBeforeLast: function (delimiter, startPos) {
			const pos = startPos || this.length - 1;
			const start = this.lastIndexOf(delimiter, pos);
			if (start < 0) return this.substring(pos);
			return this.substring(start + 1);
		},

		substringAfterLast: function (delimiter, startPos) {
			const pos = startPos || this.length;
			const start = this.lastIndexOf(delimiter, pos);
			if (start < 0) return this.substring(pos);
			return this.substring(start + 1, pos);
		}
	});
});