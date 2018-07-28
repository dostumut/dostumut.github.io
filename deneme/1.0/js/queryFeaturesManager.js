define([
  "dojo/_base/declare", "dojo/_base/lang", "dojo/on", "dojo/_base/array",
  "esri/tasks/QueryTask", "esri/tasks/query",
  "esri/dijit/PopupTemplate", "esri/geometry/Point",
  "esri/symbols/SimpleMarkerSymbol", "esri/symbols/SimpleLineSymbol", "esri/symbols/SimpleFillSymbol", "esri/Color"
], function(
  declare, lang, on, array,
  QueryTask, Query,
  PopupTemplate, Point,
  SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, Color
){
  return declare(null, {
    map: null,
    layerName: null,
    queryTask: null,
    query: new Query(),
    constructor: function(params) {
      this.map = params.map;
      this.queryTask = new QueryTask(params.queryUrl);
      this.layerName = params.layerName;
      this.query.where = this.parseQueryFeatures(params.queryFeatures);
      if (this.query.where.length > 0) {
        this.doQueryTask();
      }
      else {
        console.log("Can't execute features query.");
      }
    },
    isNumber: function(n) {
      return /^-?[\d.]+(?:e-?\d+)?$/.test(n);
    },
    parseQueryFeatures: function(queryFeatures) {
      var where = "";
      // if strings contains one ":"
      if (queryFeatures.split(":").length-1 === 1) {
        var arr = queryFeatures.split(":");
        where = arr[0] + " in (";
        var values = arr[1].split(",");
        for (var i = 0; i < values.length; i++) {
          if (this.isNumber(values[i])) {
            where += values[i] + ", ";
          }
          else {
            where += "'"+values[i] + "', ";
          }
        }
        where = where.slice(0, -2) + ")";
      }
      else {
        console.log("Bad 'features' parameter.");
      }
      return where;
    },
    doQueryTask: function() {
      this.query.outFields = ["*"];
      this.query.returnGeometry = true;
      var mapa = this.map;
      var layerName = this.layerName;

      this.queryTask.execute(this.query,
        function(fset) {
          var resultFeatures = fset.features;
          mapa.graphics.clear();
          if (resultFeatures.length === 1) {
            var fieldInfos = [];
            var excludeInPopup = ["OBJECTID", "OBJECTID_1", "Shape", "Shape_Length", "Shape_Area"];
            for (var attribute in resultFeatures[0].attributes) {
              if (resultFeatures[0].attributes.hasOwnProperty(attribute)) {
                if (excludeInPopup.indexOf(attribute) === -1) {
                  var fieldInfo = {
                    fieldName: attribute,
                    visible: true,
                    label: attribute+":"
                  };
                  fieldInfos.push(fieldInfo);
                }
              }
            }
            var template = new PopupTemplate({
              title: layerName,
              fieldInfos: fieldInfos
            }); //Select template based on layer name
            resultFeatures[0].setInfoTemplate(template);
            var res = [resultFeatures[0]];

            var popupLocation;
            if (fset.geometryType == "esriGeometryPolyline") {
              var mid = parseInt(resultFeatures[0].geometry.paths[0].length / 2);
              var coords = resultFeatures[0].geometry.paths[0][mid];

              popupLocation = new Point(coords, mapa.spatialReference);
            }
            else if (fset.geometryType == "esriGeometryPolygon") {
              popupLocation = resultFeatures[0].geometry.getExtent().getCenter();
            }
            else if (fset.geometryType == "esriGeometryPoint") {
              var symbol = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_SQUARE, 20,
                            new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                            new Color([0,0,0,0.0]), 0),
                            new Color([0,0,0,0.0]));
              resultFeatures[0].symbol = symbol;
              popupLocation = resultFeatures[0].geometry;
              mapa.graphics.add(resultFeatures[0]);
            }
            mapa.infoWindow.setFeatures(res);
            mapa.infoWindow.show(popupLocation);
          }
          else {
            if (fset.geometryType == "esriGeometryPoint") {
              var pOutline = new SimpleLineSymbol();
              pOutline.setStyle(SimpleLineSymbol.STYLE_SOLID);
              pOutline.setWidth(2);
              pOutline.setColor(new Color([0, 255, 255, 1.0]));
              var pSymbol = new SimpleMarkerSymbol();
              pSymbol.setStyle(SimpleMarkerSymbol.STYLE_SQUARE);
              pSymbol.setOutline(pOutline);
              pSymbol.setSize(20);
              pSymbol.setColor(new Color([0, 0, 0, 0.0]));
              array.forEach(resultFeatures, function(feature){
                feature.setSymbol(pSymbol);
                mapa.graphics.add(feature);
              });
            }
            else if (fset.geometryType == "esriGeometryPolyline") {
              var lSymbol = new SimpleLineSymbol();
              lSymbol.setStyle(SimpleLineSymbol.STYLE_SOLID);
              lSymbol.setWidth(2);
              lSymbol.setColor(new Color([255, 0, 0]));
              array.forEach(resultFeatures, function(feature){
                feature.setSymbol(lSymbol);
                mapa.graphics.add(feature);
              });
            }
            else if (fset.geometryType == "esriGeometryPolygon") {
              var pgOutline = new SimpleLineSymbol();
              pgOutline.setStyle(SimpleLineSymbol.STYLE_SOLID);
              pgOutline.setWidth(2);
              pgOutline.setColor(new Color([255, 0, 0]));
              var pgSymbol = new SimpleFillSymbol();
              pgSymbol.setStyle(SimpleFillSymbol.STYLE_SOLID);
              pgSymbol.setOutline(pgOutline);
              pgSymbol.setColor(new Color([255, 255, 0, 0.25]));
              array.forEach(resultFeatures, function(feature){
                feature.setSymbol(pgSymbol);
                mapa.graphics.add(feature);
              });
            }
          }
        },
        function(error) {
          console.log(error.message);
        });
    }
  });
});
