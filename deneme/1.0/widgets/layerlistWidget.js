define([
  "dojo/_base/declare", "dojo/_base/fx", "dojo/_base/lang", "dojo/dom-style", "dojo/mouse", "dojo/dom-class", "dojo/_base/window",
  "dojo/on", "dojo/dom", "dojo/dom-construct", "dojo/_base/array", "dojo/query!css3",
  "dojo/store/Memory","dijit/tree/ObjectStoreModel", "dijit/Tree", "dijit/form/FilteringSelect",
  "esri/request", "esri/tasks/IdentifyTask", "esri/tasks/IdentifyParameters",
  "dijit/form/HorizontalSlider", "dijit/form/HorizontalRule", "dijit/form/HorizontalRuleLabels", "dijit/form/CheckBox", "dijit/Tooltip",
  "mads/js/queryFeaturesManager",
  "dijit/_WidgetBase", "dijit/_TemplatedMixin",
  "dojo/text!./templates/layerlistWidget.html"
], function(declare, baseFx, lang, domStyle, mouse, domClass, win,
  on, dom, domConstruct, array, query,
  Memory, ObjectStoreModel, Tree, FilteringSelect,
  esriRequest, IdentifyTask, IdentifyParameters,
  HorizontalSlider, HorizontalRule, HorizontalRuleLabels, checkBox, Tooltip,
  queryFeaturesManager,
  _WidgetBase, _TemplatedMixin,
  template){
  return declare([_WidgetBase, _TemplatedMixin], {
    templateString: template,
    baseClass: "layerlistWidget",
    map: null,
    tree: null,
    store: null,
    data: [{ id: 'layerlist', leaf: false}],
    legendInfo: {},
    metadataIDS: {},
    identify: {},
    visitedNodesIds: {},
    constructor: function(params) {
      this.map = params.map;
    },

    postCreate: function() {
      this.getLegendInfo();
      this.getMetadataIDS();
      // on search button click
      on(this.collapseLayerList, "click", lang.hitch(this, function(){
        var llcnode = dijit.byId("layerlistContainer").domNode;
        var containerWidth = domStyle.get(llcnode, "width");
        var slidePane = dojo.animateProperty({
          node: llcnode,
          duration: 500,
          properties: {
              width: {
                  end: 25
              }
          },
          onBegin: function(){
            document.getElementById("collapseLayerList").style.display = "none";
          },
          onEnd: function(){
            document.getElementById("layerlistSectionsContainer").style.display = "none";
            document.getElementById("expandLayerList").style.display = "block";
          }
        });
        slidePane.play();
      }));

      on(this.expandLayerList, "click", lang.hitch(this, function(){
        var llcnode = dijit.byId("layerlistContainer").domNode;
        var containerWidth = domStyle.get(llcnode, "width");
        var slidePane = dojo.animateProperty({
          node: llcnode,
          duration: 500,
          properties: {
              width: {
                  end: 377
              }
          },
          onBegin: function(){
            document.getElementById("layerlistSectionsContainer").style.display = "block";
            document.getElementById("expandLayerList").style.display = "none";
          },
          onEnd: function(){
            document.getElementById("collapseLayerList").style.display = "block";
          }
        });
        slidePane.play();
      }));

      // on collapse button click
      on(this.collapseAllButton, "click", lang.hitch(this, function(){
        this.tree.collapseAll();
      }));

      // on hide button click
      on(this.hideAllButton, "click", lang.hitch(this, function(){
        //this.hideAllClicked = true;
        for (var id in this.visitedNodesIds) {
          if (this.visitedNodesIds.hasOwnProperty(id)) {
            var n = this.tree.getNodeFromItem(id);
            //console.log(n);
            delete this.visitedNodesIds[id];
            domStyle.set(n.rowNode, {
              "background-color": ""
            });
            if (n.checkBox) {
              n.checkBox.set("checked", false);
            }
          }
        }
        //this.hideAllClicked = false;
      }));

      // on clear selection button click
      on(this.clearSelectionButton, "click", lang.hitch(this, function(){
        this.map.graphics.clear();
        this.map.infoWindow.hide();
        //dojo.style(dojo.byId('myDiv'), "display", "none");
        domStyle.set(this.clearSelectionButton, {"display": "none"});
      }));
    },
    // get all services layers legend info from rest
    getLegendInfo: function() {
      var requestHandle = null;
      array.forEach(this.map.layerIds, lang.hitch(this, function(layerId){
        if (layerId !== "Basemap") {
          var lyr = this.map.getLayer(layerId);
          requestHandle = esriRequest({
            url: lyr.url+"/legend",
            content: { f: "json" },
            handleAs: "json",
            callbackParamName: "callback"
          });
          requestHandle.then(lang.hitch(this, function(response) {
            this.legendInfo[layerId] = [];
            array.forEach(response.layers, lang.hitch(this, function(layer){
              this.legendInfo[layerId][layer.layerId] = layer.legend;
            }));
          }), lang.hitch(this, function(error) {
            console.log("Error. Can't get legend info for " + layerId + ". Error message: ", error.message);
          }));
        }
      }));
    },

    getMetadataIDS: function() {
      var windowUrl = window.location.pathname;
      windowUrl = windowUrl.replace("index.html", "");
      var requestHandle = esriRequest({
        url: windowUrl + madsVersion + "/config/metadataIDS.json?version=" + metadataIDSversion,
        //url: "http://62.236.121.188/website/MADS/v10_js_11-05-2017/config/metadataIDS.json",
        handleAs: "json"
      });
      requestHandle.then(lang.hitch(this, function(response) {
        this.metadataIDS = response;
        this.setupLayerListAndDisplayLayer();
      }), lang.hitch(this, function(error) {
        console.log("Error. Can't get metadata IDs. Error message: ", error.message);
        this.setupLayerListAndDisplayLayer();
      }));
    },

    setupLayerListAndDisplayLayer: function() {
      this.createDataArray();
      setTimeout(lang.hitch(this, function(){
        this.createTree();
        var datasetID = this.getURLParameter("datasetID");
        if (datasetID) {
          setTimeout(lang.hitch(this, function(){
            this.showLayer(datasetID);
            document.getElementById("loadingCover").style.display = "none";
          }), 3000);
        }
        else {
          document.getElementById("loadingCover").style.display = "none";
        }
      }), 3000);
    },

    createDataArray: function() {
      // for each service (starting from the last to have bottom most map service in the bottom of layer list)
      //array.forEach(this.map.layerIds, lang.hitch(this, function(layerId){
      for(var i=this.map.layerIds.length-1; i>=0; i--){
        var layerId = this.map.layerIds[i];
        if (layerId !== "Basemap") {
          // add top most level to layer list
          this.data.push({id: layerId+"_top", parent: "layerlist", name: layerId, topGroup: true, leaf: false, layer: layerId});

          var lyr = this.map.getLayer(layerId);

          /*lyr.on("visibility-change", function(visible){
            console.log('layer visibility-change');
          });*/
          //for each layer in service
          array.forEach(lyr.layerInfos, lang.hitch(this, function(lyrInfo){

            // check if layer is a leaf
            var isLeaf = false;
            if (lyrInfo.subLayerIds) {
              isLeaf = false;
            }
            else {
              isLeaf = true;
            }
            // add all levels and set parent levels
            if (lyrInfo.parentLayerId === -1) {
              this.data.push({id: layerId+"_"+lyrInfo.id, parent: layerId+"_top", name: lyrInfo.name, topGroup: false, leaf: isLeaf, layer: layerId, visibilityId: lyrInfo.id, metadataId: this.metadataIDS[layerId+"_"+lyrInfo.id]});
            }
            else {
              this.data.push({id: layerId+"_"+lyrInfo.id, parent: layerId+"_"+lyrInfo.parentLayerId, name: lyrInfo.name, topGroup: false, leaf: isLeaf, layer: layerId, visibilityId: lyrInfo.id, metadataId: this.metadataIDS[layerId+"_"+lyrInfo.id]});
            }
          }));

          // create Identify Task for each service
          var idp = new IdentifyParameters();
          idp.tolerance = 6;
          idp.returnGeometry = true;
          idp.layerOption = IdentifyParameters.LAYER_OPTION_TOP;
          idp.layerIds = [];

          this.identify[layerId] = {
            "task": new IdentifyTask(lyr.url),
            "params": idp
          };
        }
      //}));
      }
    },

    createTree: function() {
      var mapa = this.map;
      var topServiceIndex = mapa.layerIds.length - 1;
      var visitedNodesIds = this.visitedNodesIds;
      //var hideAllClicked = this.hideAllClicked;
      var identify = this.identify;
      var legendInfo = this.legendInfo;
      //this.createDataArray();
      var myStore = new Memory({
        data: this.data,
        getChildren: function(object){
            return this.query({parent: object.id});
        }
      });
      this.store = myStore;
      var myModel = new ObjectStoreModel({
        store: myStore,
        query: {id: 'layerlist'}
      });

      var filteringSelect = new FilteringSelect({
        id: "layerSearchInput",
        name: "layerSearch",
        class: "layerSearchInput",
        queryExpr: "*${0}*",
        autoComplete: false,
        required: false,
        forceWidth: true,
        hasDownArrow: false,
        placeHolder: "Search...",
        store: myStore,
        searchAttr: "name",
        onChange: lang.hitch(this, function(state){
          var id = dijit.byId("layerSearchInput").get('value');
          //console.log(id);
          this.showLayer(id);
          // clear search field
          dijit.byId("layerSearchInput").set("value", "");
        })
      }, this.layerSearchInput).startup();

      this.tree = new Tree({
        model: myModel,
        showRoot: false,
        getIconClass:function(item, opened){

        },
        getNodeFromItem: function (id) {
          //return this._itemNodesMap[item.name[0]];
          return this._itemNodesMap[ id ][0];
        },

        _createTreeNode: function(args) {
          var tnode = new dijit._TreeNode(args);
          tnode.labelNode.innerHTML = args.label;
          // if tree node is a service layer
          if (tnode.item.topGroup) {
            // get the service layer for changing opacity and moving up and down
            var layerOpacity = mapa.getLayer(tnode.item.layer);
            // create an arrow button to open menu
            var topGroupButton = domConstruct.create("div", { "class": "topGroupButton" }, tnode.rowNode, "last");
            // open menu and hide previously open menu
            on(topGroupButton, "click", function(){
                query(".layerTopGroupMenu").forEach(function(node){
                domStyle.set(node, {"display": "none"});
              });
              var pos = dojo.position(topGroupButton, true);
              domStyle.set(layerTopGroupMenu, {"top": pos.y +13+"px", "left": pos.x+"px", "display": "block"});
            });

            // create a menu
            var layerTopGroupMenu = domConstruct.create("div", { "class": "layerTopGroupMenu" }, win.body(), "last");
            // create opacity thing
            var opacityThing = domConstruct.create("div", { "class": "layerTopGroupMenuContainer", "style": "margin-bottom: 20px" }, layerTopGroupMenu, "last");
            var opacityLabel = domConstruct.create("div", { "class": "layerTopGroupMenuLabels", innerHTML: "Layers opacity" }, opacityThing, "first");
            var sliderDiv = domConstruct.create("div", { "class": "sliderDiv" }, opacityThing, "last");
            var slider = new HorizontalSlider({
              name: "slider",
              value: layerOpacity.opacity,
              minimum: 0,
              maximum: 1,
              intermediateChanges: true,
              showButtons: false,
              onChange: function(value){
                layerOpacity.setOpacity(value);
              }
            }, sliderDiv);

            var sliderLabelsNode = domConstruct.create("div", {}, opacityThing, "last");
            var sliderLabels = new HorizontalRuleLabels({
              container: "bottomDecoration",
              labelStyle: "font-size: 10px;",
              labels: ["min", "max"]
            }, sliderLabelsNode);

            slider.startup();
            sliderLabels.startup();

            // create move up and down things
            var upThing = domConstruct.create("div", { "class": "layerTopGroupMenuMoveUp", innerHTML: "Move up" }, layerTopGroupMenu, "last");
            var downThing = domConstruct.create("div", { "class": "layerTopGroupMenuMoveDown", innerHTML: "Move down" }, layerTopGroupMenu, "last");

            // on up thing clicked change layer order, move tree node and reposition menu
            on(upThing, "click", function(){
              if (mapa.layerIds.indexOf(tnode.item.name) < topServiceIndex) {
                mapa.reorderLayer(layerOpacity, mapa.layerIds.indexOf(tnode.item.name)+1);
                dojo.place(tnode.domNode, tnode.domNode.previousSibling, "before");
                var pos = dojo.position(topGroupButton, true);
                domStyle.set(layerTopGroupMenu, {"top": pos.y +13+"px", "left": pos.x+"px", "display": "block"});
              }
            });

            // on down thing clicked change layer order, move tree node and reposition menu
            on(downThing, "click", function(){
              // because of the Basemap layer has always index 0, check layers position before reordering
              if (mapa.layerIds.indexOf(tnode.item.name) > 1) {
                mapa.reorderLayer(layerOpacity, mapa.layerIds.indexOf(tnode.item.name)-1);
                dojo.place(tnode.domNode, tnode.domNode.nextSibling, "after");
                var pos = dojo.position(topGroupButton, true);
                domStyle.set(layerTopGroupMenu, {"top": pos.y +13+"px", "left": pos.x+"px", "display": "block"});
              }
            });

          }
          // if tree node is a data layer
          else if (tnode.item.leaf) {
            dojo.destroy(tnode.expandoNode);
            var cb = new dijit.form.CheckBox();
            cb.placeAt(tnode.contentNode, "first");

            // metadata button
            var metadataButton = domConstruct.create("div", { "class": "metadataButton" }, tnode.contentNode, "last");
            new Tooltip({
              //class: "tooltipPopup",
              connectId: [metadataButton],
              showDelay: 100,
              label: "View metadata"
            });

            //var identifyButton = domConstruct.create("div", { "class": "rowMenuButton" }, tnode.contentNode, "last");

            // set sublayers label width depending on sublayer level in the tree
            var rowNodePadding = domStyle.get(tnode.rowNode, "padding-left");
            var labelNodeWidth = 258 - rowNodePadding;
            domStyle.set(tnode.labelNode, {"width": labelNodeWidth+"px"});

            // create legend node
            var legendContainerDiv = domConstruct.create("div", { "class": "legendContainerDiv" }, tnode.rowNode, "last");

            var layer = mapa.getLayer(tnode.item.layer);
            var lIs = legendInfo[layer.id][tnode.item.visibilityId];
            // create legend row
            array.forEach(lIs, lang.hitch(this, function(lI){
              var legendRow = domConstruct.create("div", { "class": "legendRow" }, legendContainerDiv, "last");

              legendRow.innerHTML = lI.label;
              var legendRowStyle = {
                "background-image": 'url("'+layer.url+'/'+tnode.item.visibilityId+'/images/' + lI.url+'")',
                "line-height": lI.height+"px",
                "padding-left": lI.width+5+"px",
                "margin-left": "22px",
                "width": 238-rowNodePadding+"px"
              };
              domStyle.set(legendRow, legendRowStyle);
            }));

            // on sublayer check box click
            on(cb, "change", function(checked){
              var visible = layer.visibleLayers;
              if (checked) {

                // make sublayer visible
                visible.push(tnode.item.visibilityId);
                layer.setVisibleLayers(visible);

                // show legend
                domStyle.set(legendContainerDiv, "display", "block");

                // add sublayer for identify task
                identify[tnode.item.layer].params.layerIds.push(tnode.item.visibilityId);

                // set tree path nodes style on select
                array.forEach(tnode.tree.path, lang.hitch(this, function(object, i){
                  if (i>0) {
                    var n = tnode.tree.getNodeFromItem(object.id);
                    domStyle.set(n.rowNode, {
                      "background-color": "#A5C0DE"
                    });
                    if (visitedNodesIds.hasOwnProperty(object.id)) {
                      visitedNodesIds[object.id] = visitedNodesIds[object.id] + 1;
                    }
                    else {
                      visitedNodesIds[object.id] = 1;
                    }
                  }
                }));
                //console.log(visitedNodesIds);
              }
              else {
                // hide sublayer
                var index = visible.indexOf(tnode.item.visibilityId);
                if (index > -1) {
                  visible.splice(index, 1);
                  layer.setVisibleLayers(visible);

                  // remove sublayer for identify task
                  identify[tnode.item.layer].params.layerIds.splice(index, 1);

                  // remove tree path nodes style on unselect
                  //console.log(tnode.tree.path);
                  /*if (hideAllClicked) {
                    console.log("hide");
                  }*/
                  array.forEach(tnode.tree.path, lang.hitch(this, function(object, i){
                    if (i>0) {
                        var n = tnode.tree.getNodeFromItem(object.id);
                        if (visitedNodesIds[object.id] == 1) {
                          delete visitedNodesIds[object.id];
                          domStyle.set(n.rowNode, {
                            "background-color": ""
                          });
                        }
                        else if (visitedNodesIds[object.id] > 1) {
                          visitedNodesIds[object.id] = visitedNodesIds[object.id] - 1;
                        }
                    }
                  }));
                  //}
                  //console.log(visitedNodesIds);
                }
                // hide legend
                domStyle.set(legendContainerDiv, "display", "none");
              }
            });
            tnode.checkBox = cb;

            // on row menu button click


            on(metadataButton, "click", function(){
              var metadataBaseURL = "http://metadata.helcom.fi/geonetwork/srv/eng/catalog.search#/metadata/";
          	  window.open(metadataBaseURL + tnode.item.metadataId, '_blank');
            });
            /*on(metadataButton, "mouseover", function(){
              var tooltip = document.getElementById("tooltippopup");
              tooltip.innerHTML = "View metadata";
              tooltip.style.visibility = "visible";
            });*/
          }
          return tnode;
        }
      });
      this.tree.placeAt(this.layerListTree);
      this.tree.startup();
    },
    showLayer: function(id) {
      var layerId = null;
      // if layer id passed as a paramether
      if (this.store.get(id)) {
        layerId = id;
      }
      // if metadata id passed as a paramether
      else {
        for (var property in this.metadataIDS) {
          if (this.metadataIDS.hasOwnProperty(property)) {
            if (this.metadataIDS[property] === id) {
              layerId = property;
            }
          }
        }
      }
      var treePath = [];
      if (layerId) {
        while (this.store.get(layerId).parent) {
          treePath.unshift(layerId);
          layerId = this.store.get(layerId).parent;
        }
        treePath.unshift("layerlist");
        this.tree.set('paths', [treePath]).then(lang.hitch(this, function(path) {
          if (this.tree.selectedNode.contentNode.children.length > 0) {
            var widget = dijit.byNode(this.tree.selectedNode.contentNode.children[0]);
            if ((widget) && (widget.type === "checkbox")) {
              // check the checkbox to make sublayer visible
              widget.set('checked', true);

              // if query features by attribute
              var datasetID = this.getURLParameter("datasetID");
              var queryFeatures = this.getURLParameter("features");
              if (datasetID && queryFeatures) {
                domStyle.set(this.clearSelectionButton, {"display": "block"});
                var queryUrl = this.map.getLayer(this.tree.selectedNode.item.layer).url+"/"+this.tree.selectedNode.item.visibilityId;
                var qFM = new queryFeaturesManager({
                  map: this.map,
                  queryFeatures: queryFeatures,
                  queryUrl: queryUrl,
                  layerName: this.tree.selectedNode.item.name
                });
              }
            }
          }
          var selectedTreeElement = document.getElementById(this.tree.selectedNode.id);
          document.getElementById("layerListTreeID").scrollTop = selectedTreeElement.offsetTop;
        }));
      }
      else {
        //alert("No layer with Id " + id);
      }
    },

    getURLParameter: function(name) {
			return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
		}
  });
});
