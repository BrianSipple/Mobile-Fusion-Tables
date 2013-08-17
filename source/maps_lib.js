/*!
 * Mobile version of Derek Eder's searchable map template
 * with Google Fusion Tables
 * http://derekeder.com/searchable_map_template/
 *
 * Copyright 2012, Derek Eder
 * Licensed under the MIT license.
 * https://github.com/derekeder/FusionTable-Map-Template/wiki/License
 *
 * Date: 12/10/2012
 *
 * To Customize, replace the values and implementations between the
 * "CUSTOM DATA AND CODE" markers.  It's all in one chunk below.
 *
 */

var MapsLib = MapsLib || {};
var MapsLib = {

  ////////////////////////////////
  // BEGIN CUSTOM DATA AND CODE //
  ////////////////////////////////

  // top title (including title of website)
  title: "Inspection Data",

  //center that your map defaults to
  map_default_center: new google.maps.LatLng(37.77, -122.45), 

  //-- BEGIN Fusion Table details (using v1 Fusion Tables API) --//
  //See https://developers.google.com/fusiontables/docs/v1/migration_guide for more info

  //the encrypted Table ID of your Fusion Table (found under File => About)
  fusionTableId:      "1kjZeEXWdu2NmsWKFnMoqek4f0EV-dVIJjxMHg6w",

  //*New Fusion Tables Requirement* API key. found at https://code.google.com/apis/console/
  //*Important* this key is for demonstration purposes. please register your own.
  googleApiKey:       "AIzaSyAMVBSXes-6P-gWaxRj20GK8NT6WDVpozM",

  //name of the location column in your Fusion Table.
  //NOTE: if your location column name has spaces in it, surround it with single quotes
  locationColumn:     "latitude",

  //-- END Fusion Table details --//


  //-- BEGIN Search customizations --//
  locationScope:      "San Francisco, CA",      //format: [City,] STATE.  (can be null/empty)  geographical area for all address searches
  recordName:         "result",       //for showing number of results
  recordNamePlural:   "results",
  customSearchFilter: "", // Used to store the current search filter globally.

  // the following radii are in meters.  1 mile = 1610 m
  searchRadius:       1610 * 0.5,     // 1/2 mile

  //-- END Search customizations --//


  //-- BEGIN Launch/Zoom behavior --//
  maxRadius:          1610 * 5,       // -1: always start at current location
                                      //  0: always start at map_default_center
                                      // >0: start at map_default_center if we're more than maxRadius away
                                      //     sends alert with maxRadiusExceededMessage (unless it's empty) 
  maxRadiusExceededMessage: "Your location is far away from San Francisco.  Defaulting to city limits.",

  defaultZoom:        11,             //zoom level when map is loaded (bigger is more zoomed in)
  nearbyZoom:         17,             //zoom level when using nearby location

  //-- END Launch/Zoom behavior --//

  // Returns HTML text for infobox contents based on row data.
  // Also used to populate cells in 'list' view.
  customInfoboxHTML: function(row, isListView) {

    html = "<div class='{{classes.infobox}}'> \
            <div class='score {{classes.score}}'>{{info.score}}</div> \
            <h4 class='{{classes.name}}'>{{info.name}}</h4> \
            <p class='{{classes.date}}'><strong>{{info.date}}</strong></p> \
            <p class='{{classes.address}}'>{{info.address}} \
            {{{violations_header}}}{{#list violations}}{{/list}} \
            </p></div>";

    // Helper function - allows for default value and missing columns.
    getValue = function(columnName, defVal) {
        if (typeof(defVal)==='undefined') defVal='';
        return (row[columnName] || {"value" : defVal}).value;
    };
    if (typeof(isListView)==='undefined') isListView = false;
    var classes = {}, info = {};

    classes['infobox'] = isListView ? "infobox-container" : "infobox-container-map";
    classes['score']   = getValue('last_score_category');
    classes['name']    = "infobox-header";
    classes['date']    = "ui-li-desc infobox-subheader";
    classes['address'] = "ui-li-desc";

    info['score']   = getValue('last_score','?');
    info['name']    = getValue('name');
    info['date']    = (getValue('last_inspection_date') != "") ? "Inspected " + getValue('last_inspection_date') : "No inspection result";
    info['address'] = getValue('address');

    var showViolations = !isListView && getValue('violation_1') != "";
    var header = showViolations ? "<br/><br/><b>Recent violations:</b>" : "";
    var violations = showViolations ? ['violation_1', 'violation_2', 'violation_3'] : [];

    // Handlebars helper - list items with custom delimiter
    Handlebars.registerHelper('list', function(items, options) {
      var out = "";
      for(var i=0, l=items.length; i<l; i++) {
        if (getValue(items[i]) != "")
        {
          out += "<br>- " + getValue(items[i]);
        }
      }
      return out;
    });

    var template = Handlebars.compile(html);
    //var template = Handlebars.templates['infobox.helper']
    return template({classes: classes, 
                     info: info, 
                     violations_header: header, 
                     violations: violations});
  },

  // whatever comes after "WHERE" in your FusionTable query should go here
  customWhereClause: function () {
    // Custom filters for filtering by food score
    var scoreRange = $("#score-filter").find(":selected").val()
    var searchClause = "'last_score'";
    switch (scoreRange*1)
    {
      case 1:
        searchClause += ">90";
        break;
      case 2:
        searchClause += ">85 AND 'last_score' <= 90 ";
        break;
      case 3:
        searchClause += ">70 AND 'last_score' <= 85 ";
        break;
      case 4:
        searchClause += "<=70 AND 'last_score' > 0 "
        break;
      default:
        searchClause += ">0"; // ignoring 0 because they're not restaurants
        break;
    }
    /*
    // TODO: enable searching for keywords once violation fields have been merged
    var keyword = $("#keyword-filter").val();
    if (keyword.length > 0) {
      searchClause += " AND 'violations' LIKE '%" + keyword + "%'";
    }
    */
    return searchClause;
  },

  customInit: function () {
    // add custom initialization code here
  },

  //////////////////////////////
  // END CUSTOM DATA AND CODE //
  //////////////////////////////
  map_centroid:       null, // gets initialized below
  num_list_rows:      0, 
  in_query:           false, 
  addrMarkerImage:    '//maps.google.com/intl/en_us/mapfiles/ms/micons/red-dot.png',
  blueDotImage:       '//maps.google.com/intl/en_us/mapfiles/ms/micons/blue-dot.png',
  currentPinpoint:    null,
  infoWindow:         new google.maps.InfoWindow({}),
  overrideCenter:     false, 
  ignoreResize:       false,

  initialize: function() {
    document.title = MapsLib.title;
    $("#titlebar").text(MapsLib.title);

    $( "#result_count" ).html("");
    MapsLib.map_centroid = MapsLib.map_default_center;

    geocoder = new google.maps.Geocoder();
    var myOptions = {
      zoom: MapsLib.defaultZoom,
      center: MapsLib.map_centroid,
      streetViewControl: false,
      panControl: false,
      mapTypeControl: false,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    // hide map until we get current location (to avoid snapping)
    $("#map_canvas").css("visibility","hidden"); 
    map = new google.maps.Map($("#map_canvas")[0],myOptions);
    
    // add to list view when user scrolls to the bottom
    $(window).scroll(function() {
       if (MapsLib.num_list_rows == 0) return;

       var listHeight = $("#page-list").height();
       if (MapsLib.num_list_rows == 10)
       {
          // HACK: the page-list height isn't properly updated the first time, so
          // hard-code 10 * max-height of cell
          listHeight = 800;
       }
       //console.log($(window).scrollTop(), $(window).height(), listHeight );
       if(!MapsLib.in_query && $(window).scrollTop() + $(window).height() >= listHeight - 100) {
           MapsLib.updateListView();
       }
    });

    updateCenter = function(userPosition) {
      var nearbyPosition = null;
      var useNearbyPosition = true;

      // don't follow user if maxRadius is 0
      if (MapsLib.maxRadius == 0)
      {
        useNearbyPosition = false;
      }
      else
      { 
        nearbyPosition = new google.maps.LatLng(userPosition.coords.latitude, userPosition.coords.longitude);
        if (MapsLib.maxRadius > 0)
        {
          // check our distance from the default center
          var dist = google.maps.geometry.spherical.computeDistanceBetween(nearbyPosition, MapsLib.map_default_center);
          if (dist > MapsLib.maxRadius)
          {
            useNearbyPosition = false;
            if (MapsLib.maxRadiusExceededMessage && MapsLib.maxRadiusExceededMessage.length > 0)
            {
              $( "#maxRadiusExceededMessageText" ).text(MapsLib.maxRadiusExceededMessage);
              $( "#popupDialog" ).popup( "open" );
            }
          }
        }
      }
      map.setCenter(useNearbyPosition ? nearbyPosition : MapsLib.map_default_center);
      map.setZoom(useNearbyPosition ? MapsLib.nearbyZoom : MapsLib.defaultZoom);
      MapsLib.map_centroid = useNearbyPosition ? nearbyPosition : MapsLib.map_default_center;
      if (useNearbyPosition)
      {
        if (MapsLib.localMarker != null)
        {
          MapsLib.localMarker.setMap(null);
        }
        MapsLib.localMarker = new google.maps.Marker({
          position: nearbyPosition,
          map: map,
          icon: MapsLib.blueDotImage,
          animation: google.maps.Animation.DROP,
          title:"You are here."
        });
        google.maps.event.addListener(MapsLib.localMarker, 'click', function() {
            MapsLib.infoWindow.setContent('<div id="infobox-container">You are here.</div>');
            MapsLib.infoWindow.open(map, this);
        }); 
      }
    }

    function locationError(err) {
      // TODO: this alert messes up the pin display on Android emulator.
      //   If this is not a problem on an actual Android, uncomment alert.
      //alert("Timed out getting current position.");
    };

    getlocation = function(){
        if (navigator.geolocation) {
          var options = {
            timeout: 5000
          };
          navigator.geolocation.getCurrentPosition(updateCenter, locationError, options);
        } else {
          alert("Your device is not sharing its location.");
        }
        return false;
    }
    getlocation();
    $("#map_canvas").css("visibility","visible"); 

    // Wire up event handler for nearby button.
    $("a#nearby").click(function(e) {
        //e.stopImmediatePropagation();
        //e.preventDefault();
        getlocation();
        setTimeout("$('a#nearby').removeClass('ui-btn-active')", 500);
    }
    );

    // maintains map centerpoint for responsive design
    google.maps.event.addDomListener(map, 'idle', function() {
        if (!MapsLib.overrideCenter)
        {
          MapsLib.map_centroid = map.getCenter();
        }
        google.maps.event.trigger(map, 'resize'); // resolves map redraw issue on mobile devices
        map.setCenter(MapsLib.map_centroid);
        MapsLib.overrideCenter = false;
        MapsLib.ignoreResize = false;
    });

    google.maps.event.addDomListener(window, 'resize', function() {
        if (!MapsLib.ignoreResize)
        {
          map.setCenter(MapsLib.map_centroid);
        }
    });

    MapsLib.searchrecords = null;

    //reset filters
    $("#search_address").val(MapsLib.convertToPlainString($.address.parameter('address')));
    var loadRadius = MapsLib.convertToPlainString($.address.parameter('radius'));
    if (loadRadius != "") $("#search_radius").val(loadRadius);
    else $("#search_radius").val(MapsLib.searchRadius);
    $(":checkbox").attr("checked", "checked");
    $("#result_count").hide();

    //-----custom initializers-------
    MapsLib.customInit();
    //-----end of custom initializers-------

    //run the default search
    MapsLib.doSearch();
  },

  refreshMap: function() {
    map.panBy(-1,0);
    map.panBy(1,0);
  },

  doSearch: function(location) {
    MapsLib.clearSearch();
    var address = $("#search_address").val();
    MapsLib.searchRadius = $("#search_radius").val();

    var whereClause = MapsLib.locationColumn + " not equal to '' ";

    //-----custom filters-------
    MapsLib.customSearchFilter = MapsLib.customWhereClause();
    if (MapsLib.customSearchFilter.length > 0)
    {
      whereClause += " AND " + MapsLib.customSearchFilter;
    }
    //-------end of custom filters--------

    if (address != "" && address != undefined) {

        if (MapsLib.locationScope != null && MapsLib.locationScope.replace(" ","") != "")
        {
          // append or replace tail of address with location scope (using commas as scope boundaries)
          var numCommas = (address.split(",").length - MapsLib.locationScope.split(",").length);
          var index = null, comma = 0;
          while (comma < numCommas && index != -1) {
              index = address.indexOf(",", index+1);
              comma++;
          }
          if (index == null) index = address.length;
          address = address.substring(0,index) + ", " + MapsLib.locationScope;
          $("#search_address").val(address);
        }

        geocoder.geocode( { 'address': address}, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          MapsLib.currentPinpoint = results[0].geometry.location;

          // -------- issues -------
          // Below source code sets in query strings for the search; Temporarily commented this out as it causes page load error; The query string is used for parsing out search parameters, please see method "convertToPlainString"
          // $.address.parameter('address', encodeURIComponent(address));
          // $.address.parameter('radius', encodeURIComponent(MapsLib.searchRadius));

          map.setCenter(MapsLib.currentPinpoint);
          MapsLib.map_centroid = MapsLib.currentPinpoint;

          // using bounds instead of zoom to fit search radius in map
          // already tried map.fitBounds(MapsLib.searchRadiusCircle.getBounds()) after calling drawSearchRadiusCircle;
          var bounds = new google.maps.LatLngBounds();
          var radius_est = 3.0 * MapsLib.searchRadius / 100000000; // quick and dirty estimate, not quite lat/lng coordinates
          bounds.extend(new google.maps.LatLng(MapsLib.currentPinpoint.jb - radius_est, MapsLib.currentPinpoint.kb));
          bounds.extend(new google.maps.LatLng(MapsLib.currentPinpoint.jb + radius_est, MapsLib.currentPinpoint.kb));
          bounds.extend(new google.maps.LatLng(MapsLib.currentPinpoint.jb, MapsLib.currentPinpoint.kb - radius_est));
          bounds.extend(new google.maps.LatLng(MapsLib.currentPinpoint.jb, MapsLib.currentPinpoint.kb + radius_est));

          map.fitBounds(bounds); 

          MapsLib.addrMarker = new google.maps.Marker({
            position: MapsLib.currentPinpoint,
            map: map,
            icon: MapsLib.addrMarkerImage,
            animation: google.maps.Animation.DROP,
            title:address
          });

          // Map now refocuses instead of filtering by search location
          // whereClause += " AND ST_INTERSECTS(" + MapsLib.locationColumn + ", CIRCLE(LATLNG" + MapsLib.currentPinpoint.toString() + "," + MapsLib.searchRadius + "))";

          MapsLib.drawSearchRadiusCircle(MapsLib.currentPinpoint);
          MapsLib.submitSearch(whereClause, map, MapsLib.currentPinpoint);
        }
        else {
          alert("We could not find your address: " + status);
        }
      });
    }
    else { //search without geocoding callback
      MapsLib.submitSearch(whereClause, map);
    }
  },

  submitSearch: function(whereClause, map, location) {
    //get using all filters
    //NOTE: styleId and templateId are recently added attributes to load custom marker styles and info windows
    //you can find your Ids inside the link generated by the 'Publish' option in Fusion Tables
    //for more details, see https://developers.google.com/fusiontables/docs/v1/using#WorkingStyles

    MapsLib.searchrecords = new google.maps.FusionTablesLayer({
      query: {
        from:   MapsLib.fusionTableId,
        select: MapsLib.locationColumn,
        where:  whereClause
      },
      styleId: 2,
      templateId: 3,
      suppressInfoWindows: true
    });
    google.maps.event.clearListeners(MapsLib.searchrecords, 'click');
    google.maps.event.addListener(MapsLib.searchrecords, 'click', function(e) {
        if (typeof(MapsLib.customInfoboxHTML != 'undefined'))
        {
            // NOTE: Google's InfoWindow API currently provides no way to shorten the tail,
            // which is problematic when viewing on a mobile device in landscape mode

            MapsLib.infoWindow.setOptions({
              content: MapsLib.customInfoboxHTML(e.row),
              position: e.latLng,
              pixelOffset: e.pixelOffset
            });
            MapsLib.infoWindow.open(map);
        }
    });
    MapsLib.searchrecords.setMap(map);
    MapsLib.getCount(whereClause);
    MapsLib.overrideCenter = true;
  },

  clearSearch: function() {
    if (MapsLib.searchrecords != null)
      MapsLib.searchrecords.setMap(null);
    if (MapsLib.addrMarker != null)
      MapsLib.addrMarker.setMap(null);
    if (MapsLib.searchRadiusCircle != null)
      MapsLib.searchRadiusCircle.setMap(null);
    MapsLib.infoWindow.close();
    MapsLib.customSearchFilter = "";
  },

  findMe: function() {
    // Try W3C Geolocation (Preferred)
    var foundLocation;
    if(navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
        foundLocation = new google.maps.LatLng(position.coords.latitude,position.coords.longitude);
        MapsLib.addrFromLatLng(foundLocation);
      }, null);

    }
    else {
      alert("Sorry, we could not find your location.");
    }
  },

  addrFromLatLng: function(latLngPoint) {
    geocoder.geocode({'latLng': latLngPoint}, function(results, status) {
      if (status == google.maps.GeocoderStatus.OK) {
        if (results[1]) {
          $('#search_address').val(results[1].formatted_address);
          $('.hint').focus();
          MapsLib.doSearch();
        }
      } else {
        alert("Geocoder failed due to: " + status);
      }
    });
  },

  drawSearchRadiusCircle: function(point) {
      var circleOptions = {
        strokeColor: "#4b58a6",
        strokeOpacity: 0.3,
        strokeWeight: 1,
        fillColor: "#4b58a6",
        fillOpacity: 0.05,
        map: map,
        center: point,
        clickable: false,
        zIndex: -1,
        radius: parseInt(MapsLib.searchRadius)
      };
      MapsLib.searchRadiusCircle = new google.maps.Circle(circleOptions);
  },

  query: function(selectColumns, whereClause, orderClause, callback) {
    var queryStr = [];
    queryStr.push("SELECT " + selectColumns);
    queryStr.push(" FROM " + MapsLib.fusionTableId);
    if (whereClause) {
        queryStr.push(" WHERE " + whereClause);
    }
    if (orderClause) {
        queryStr.push(" ORDER BY " + orderClause);
    }

    var sql = encodeURIComponent(queryStr.join(" "));
    var qstr = "https://www.googleapis.com/fusiontables/v1/query?sql="+sql+"&callback="+callback+"&key="+MapsLib.googleApiKey;
    console.log("Query: " + qstr);
    $.ajax({url: qstr, dataType: "jsonp"});
  },

  handleError: function(json) {
    if (json["error"] != undefined) {
      var error = json["error"]["errors"]
      console.log("Error in Fusion Table call!");
      for (var row in error) {
        console.log(" Domain: " + error[row]["domain"]);
        console.log(" Reason: " + error[row]["reason"]);
        console.log(" Message: " + error[row]["message"]);
      }
      return true;
    }
  },

  getCount: function(whereClause) {
    var selectColumns = "Count()";
    MapsLib.query(selectColumns, whereClause, null, "MapsLib.displaySearchCount");
  },

  displaySearchCount: function(json) {
    if (MapsLib.handleError(json)) {
        return false;
    }
    var numRows = 0;
    if (json["rows"] != null)
      numRows = json["rows"][0];

    var name = MapsLib.recordNamePlural;
    if (numRows == 1)
    name = MapsLib.recordName;
    $( "#result_count" ).fadeOut(function() {
        $( "#result_count" ).html(MapsLib.addCommas(numRows) + " " + name + " found");
      });
    $( "#result_count" ).fadeIn();
  },

  addCommas: function(nStr) {
    nStr += '';
    x = nStr.split('.');
    x1 = x[0];
    x2 = x.length > 1 ? '.' + x[1] : '';
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
      x1 = x1.replace(rgx, '$1' + ',' + '$2');
    }
    return x1 + x2;
  },

  getListView: function() {
      MapsLib.num_list_rows = 0;
      MapsLib.updateListView();
  },

  updateListView: function() {
      var whereClause = MapsLib.locationColumn + " not equal to ''";
      if (MapsLib.customSearchFilter.length > 0) {
        whereClause += " AND " + MapsLib.customSearchFilter;
      }

      // HACK: all we really want is the 10 rows that come after the existing MapsLib.num_list_rows.
      //  but now we're querying all the rows up to it.  Is there a way to just get rows x to x+10? 
      var orderClause = "ST_DISTANCE(latitude, LATLNG(" + map.getCenter().lat() + "," + 
                map.getCenter().lng() + ")) LIMIT " + (MapsLib.num_list_rows + 10);
      if (MapsLib.num_list_rows == 0)
      {
        $("ul#listview").html('<li data-corners="false" data-shadow="false" data-iconshadow="true" data-theme="d">Loading results...</li>');
      }
      MapsLib.in_query = true;
      MapsLib.query("*", whereClause, orderClause, "MapsLib.displayListView");
  },

  displayListView: function(json) {
      MapsLib.in_query = false;
      if (MapsLib.handleError(json)) {
          return false;
      }
      // Empty the listview object.
      var existingRows = MapsLib.num_list_rows;
      if (existingRows == 0)
      {
        $("ul#listview").html("");
      }

      var numRows = json.rows.length;
      // we already have the first existingRows, we're just appending the remainder
      for (var ix=existingRows; ix<numRows; ix++){
          // make row object.
          var row = {};
          for (var jx=0; jx<json.columns.length; jx++) {
              row[ json.columns[jx] ] = {"value" : json.rows[ix][jx]};
          }

          var row_html = '<li data-corners="false" data-shadow="false" data-iconshadow="true" data-wrapperels="div" data-icon="arrow-r" data-iconpos="right" data-theme="d" class="ui-btn ui-btn-icon-right ui-li-has-arrow ui-li ui-btn-up-d"><div class="ui-btn-inner ui-li"><div class="ui-btn-text"><a href="todo.html" data-transition="slidedown" class="ui-link-inherit">';
          row_html += MapsLib.customInfoboxHTML(row, true);
          row_html += '</a></div><span class="ui-icon ui-icon-arrow-r ui-icon-shadow">&nbsp;</span></div></li>';

          $("ul#listview").append(row_html);
      }
      MapsLib.num_list_rows += numRows;
  },

  //converts a slug or query string in to readable text
  convertToPlainString: function(text) {
    if (text == undefined) return '';
    return decodeURIComponent(text);
  }

  //-----custom functions------------------------------------------------------
  // NOTE: if you add custom functions, make sure to append each one with a 
  // comma, except for the last one.
  // This also applies to the convertToPlainString function above
  //-----end of custom functions-----------------------------------------------
}
