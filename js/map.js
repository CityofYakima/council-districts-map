 require(["esri/map", 
      "esri/dijit/Geocoder", 
      "esri/InfoTemplate",
      "esri/layers/FeatureLayer",
      "esri/layers/ArcGISDynamicMapServiceLayer",
      "esri/layers/ImageParameters",
      "esri/graphic", 
      "esri/geometry/Multipoint",
      "esri/tasks/IdentifyTask",
      "esri/tasks/IdentifyParameters",
      "esri/dijit/HomeButton",
      "esri/dijit/LocateButton",
      "./js/utils.js", 
      "./js/bootstrapmap.js",
      "dojo/dom", 
      "dojo/on", 
      "dojo/domReady!"], 
      function(
        Map, 
        Geocoder, 
        InfoTemplate, 
        FeatureLayer, 
        ArcGISDynamicMapServiceLayer, 
        ImageParameters, 
        Graphic,  
        Multipoint, 
        IdentifyTask, 
        IdentifyParameters, 
        HomeButton, 
        LocateButton, 
        utils, 
        BootstrapMap, 
        dom, 
        on
      ) {             
        "use strict";
        
        // Create map
        var map = BootstrapMap.create("mapDiv",{
          basemap:"national-geographic",
          center: [-120.54, 46.59],
          zoom: 13
        });
        
        //Home Button
        var home = new HomeButton({
          map: map
        }, "HomeButton");
        home.startup();
        
        //add layers to map
        //Use the ImageParameters to set map service layer definitions and map service visible layers before adding to the client map.
        var imageParameters = new ImageParameters();

        //layer.setLayerDefinitions takes an array.  The index of the array corresponds to the layer id.
        //Those array elements correspond to the layer id within the remote ArcGISDynamicMapServiceLayer
       var layerDefs = [];
        layerDefs[11] = "District > 0";
        imageParameters.layerDefinitions = layerDefs;

        //11 is the council layer
        imageParameters.layerIds = [11];

        imageParameters.layerOption = ImageParameters.LAYER_OPTION_SHOW;
        imageParameters.transparent = true;

        //construct ArcGISDynamicMapServiceLayer with imageParameters from above
        var districts = new ArcGISDynamicMapServiceLayer("https://gis.yakimawa.gov/arcgis101/rest/services/General/YakimaLayers/MapServer",{
          "imageParameters": imageParameters,
          opacity: 0.5
        });
        map.addLayer(districts);
        
        //prep for identify
        var identifyTask = new IdentifyTask("https://gis.yakimawa.gov/arcgis101/rest/services/General/YakimaLayers/MapServer");
        
        var identifyParams = new IdentifyParameters();
        identifyParams.tolerance = 3;
        identifyParams.returnGeometry = true;
        identifyParams.layerIds = [11];
        identifyParams.layerOption = IdentifyParameters.LAYER_OPTION_ALL;
        identifyParams.width = map.width;
        identifyParams.height = map.height;

        //add city limits
        var cityLimits = new FeatureLayer("https://gis.yakimawa.gov/arcgis101/rest/services/General/YakimaLayers/MapServer/9",{
          outFields: ["*"]
        });
        map.addLayer(cityLimits);

        utils.setPopup(map, "top", -1, 26);
        utils.autoRecenter(map);

        var sym = utils.createPictureSymbol("./images/blue-pin.png", 0, 12, 13, 24);
        
        //Locate Button
        var geoLocate = new LocateButton({
          map: map
        }, "LocateButton");
        geoLocate.startup();
        
        // Create Geocoder widget
        var initExtent = new esri.geometry.Extent({"xmin":-13433193,"ymin":5867988,"xmax":-13409264,"ymax":5881438,"spatialReference":{"wkid":102100}});
        var locatorUrl = "https://gis.yakimawa.gov/arcgis101/rest/services/Geocode/Composite/GeocodeServer";
        var myGeocoders = [{
          url: locatorUrl,
          name: "Yakima Geocoder",
          singleLineFieldName: "Street",
          placeholder: "Find An Address",
          searchExtent: initExtent,
          outFields: ["*"]
        }];
        
        var geocoder = new Geocoder({
          autoNavigate: false,
          maxLocations: 25,
          autoComplete: false,
          arcgisGeocoder: false,
          geocoders: myGeocoders,
          map: map
        },"search");        
        geocoder.startup();

        // Wire events
        on(map, "load", function() {
          geocoder.on("select", geosearch);
          geocoder.on("findResults", geocodeResults);
          geocoder.on("clear", clearFindGraphics);
          // Wire UI events
          on(dom.byId("btnGeosearch"),"click", geosearch);
          on(dom.byId("btnClear"),"click", clearFindGraphics);
        });
         
        function geosearch() {
          var def = geocoder.find();
          def.then(function(res){
           geocodeResults(res);
          });
        }
        
        function geocodeResults(places) {
          // Translate features to places...
          places = places.results;
          if (places.length > 0) {
            clearFindGraphics();
            // Objects for the graphic
            var symbol = sym;
            var goodResults = new Array([]);
            
            // Create and add graphics with pop-ups
            for (var i = 0; i < places.length; i++) {
              var pt = places[i].feature.geometry;
              //var isYakima = cityLimits.graphics[0].geometry.contains(pt);
              if(places[i].feature.attributes.Score >= 80){
                var isYakima = cityLimits.graphics[0].geometry.contains(pt);
                if(isYakima){
                  addPlaceGraphic(places[i], symbol);
                  goodResults.push(places[i]);
                }
              }
            }
            if(goodResults.length > 0) {
              // Zoom to results
              zoomToPlaces(goodResults);
            }else {
              alert("Sorry, address or place not found.");
            }

          } else {
            alert("Sorry, address or place not found.");
          }
        }

        function geocodeSelect(item) {
          // Create and add a selected graphic with pop-up
          var g = (item.graphic ? item.graphic : item.result.feature);
          g.setSymbol(sym);
          //clearFindGraphics();
          addPlaceGraphic(item.result,g.symbol);
        }

        function addPlaceGraphic(item,symbol)  {
          var place = {};
          var attributes,infoTemplate,pt,graphic;
          pt = item.feature.geometry;
          //
          identifyParams.geometry = pt;
          identifyParams.mapExtent = map.extent;
          var idResults;
          identifyTask.execute(identifyParams, function (idResults) {
            place.district = idResults[0].value;
            place.address = item.name;

            place.score = item.feature.attributes.score;
            // Graphic components
            attributes = { address:place.address, district:place.district };   
            infoTemplate = new InfoTemplate("Search Result","<strong>Address</strong>: ${address}<br/><strong>Council District</strong>: ${district}");//clean me
            graphic = new Graphic(pt,symbol,attributes,infoTemplate);
            // Add to map
            map.graphics.add(graphic); 
          });           
        }
                  
        function zoomToPlaces(places) {
          //console.log(places);
          if(places.length > 1){
            var multiPoint = new Multipoint(map.spatialReference);
            for (var i = 0; i < places.length; i++) {
              //multiPoint.addPoint(places[i].location);
              multiPoint.addPoint(places[i].feature.geometry);
            }
            map.setExtent(multiPoint.getExtent().expand(2.0));
          }else{
            var pt = places[0].feature.geometry;
            map.centerAndZoom(pt, 18);
          }
        }

        function clearFindGraphics() {
          map.infoWindow.hide();
          map.graphics.clear();
        }
      }
    );    