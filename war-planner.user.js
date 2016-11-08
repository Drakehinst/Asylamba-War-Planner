// ==UserScript==
// @name         Asylamba War Planner
// @namespace    DrakehinstScripts
// @version      0.1
// @description  Provides an option to share missions, to allow for a better planning of galaxy-wide operations
// @author       Drakehinst
// @grant        none
// @updateURL	 
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js
// @include      http://game.asylamba.com/*/map
// ==/UserScript==

// ADDIG means it should be this way in the game (some script might have modified it previously, or it's originally bad)

var bool_debug_on = false;
var bool_show_campaign = false;
var bdd_url = "https://api.myjson.com/bins/vjpi";
var button_mission_launch = "";

$(window).load(
    function()
    {
        setupInterface();
    }
);

function addCss(newCss)
{
	if(!$('#custom-css').length)
	{
		$("head").append('<style id="custom-css" type="text/css"></style>');
	}
	$('#custom-css').append(newCss);
}

function setupInterface()
{
    // SETUP THE TOGGLE DISPLAY BUTTON
    //TODO: handle the number of plugins installed, therefore the minimap offset and number of toolbars to be displayed
    // offset the minimap down the window, to free up space for the new toolbar
    $('#map-content').css("top", $('#map-content').position().top + 30);
    // add a new toolbar background and fix positioning
    addCss('#map-option::before { height: 114px;}');
    addCss('#map-option::after { height: 114px;}');
    addCss('#map-option { height: 108px; max-width: 186px; background-repeat: initial;}');
    addCss('#map-option a { margin-top: 1px; margin-bottom: 4px;}'); // ADDIG
    // create the buttons
    var button_show_campaign = $('<a href="#" class="sh hb lb" id="toggle-shared-missions" title="Afficher les missions partagées"></a>');
    button_show_campaign.append('<img src="http://imgur.com/odWzhog.png?1" alt="show_campaigns">');
    button_show_campaign.click(toggleSharedMissions);
    //button_show_campaign.click(databaseReset);
    // insert the buttons in the toolbar
    $('#map-option').append(button_show_campaign);
    // SETUP THE INTERCEPTION OF THE MISSION LAUNCH BUTTON PRESS EVENT TO GET DATA
    $('#action-box').on("click", function()
    {
        button_mission_launch = $('#action-box li.active+li div.commander-tile div.move a');
        //button_mission_launch.on("mouseenter", {debug: bool_debug_on}, getMissionData); // TODO: on release, change "mouseenter" to "click"
        button_mission_launch.on("mouseenter", function() // TODO: on release, change "mouseenter" to "click"
        {
            pushNewMission(getMissionData());
        });
    });
    // SETUP SHARED MISSIONS DISPLAY
    $('#map').append('<div id="shared-missions"></div>');
    var svg_shared_plunderings = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg_shared_plunderings.setAttribute('viewBox', "0, 0, 5000, 5000");
    svg_shared_plunderings.setAttribute('xmlns', "http://www.w3.org/2000/svg");
    svg_shared_plunderings.setAttribute('class', "plunderings");
    $('#shared-missions').append(svg_shared_plunderings);
    var svg_shared_colonizations = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg_shared_colonizations.setAttribute('viewBox', "0, 0, 5000, 5000");
    svg_shared_colonizations.setAttribute('xmlns', "http://www.w3.org/2000/svg");
    svg_shared_colonizations.setAttribute('class', "colonizations");
    $('#shared-missions').append(svg_shared_colonizations);
    var svg_shared_conquests = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg_shared_conquests.setAttribute('viewBox', "0, 0, 5000, 5000");
    svg_shared_conquests.setAttribute('xmlns', "http://www.w3.org/2000/svg");
    svg_shared_conquests.setAttribute('class', "conquests");
    $('#shared-missions').append(svg_shared_conquests);
    addCss('#shared-missions svg.plunderings line {stroke: rgb(0,255,255); stroke-width: 1px;}'); // transform-origin: 0px 0px 0px;
    addCss('#shared-colonizations svg.colonizations line {stroke: rgb(255,255,0); stroke-width: 1px;}');
    addCss('#shared-conquests svg.conquests line {stroke: rgb(255,0,255); stroke-width: 1px;}');
    updateSharedMissions();
    // SETUP SYSTEM ONGOING MISSIONS DISPLAY
    $('#systems a').on('mouseover', function(event)
    {
        var focused_system_x = $(this).attr('style').match(/left: [0-9]+/)[0].replace(/left: /, "") * 1 + 10;
        var focused_system_y = $(this).attr('style').match(/top: [0-9]+/)[0].replace(/top: /, "") * 1 + 10;
        //console.log("focused system coords: " + focused_system_x + ", " + focused_system_y);
        getMissionsFromCoordinates(focused_system_x, focused_system_y);
    });
    $('#shared-missions').after('<div id="shared-missions-info"></div>');
    $('#shared-missions-info').attr("id", "shared-missions-info");
    addCss('#shared-missions-info table th,td { padding: 5px;}');
}

/**
 * Toggle the display on map of the shared missions
 */
function toggleSharedMissions()
{
    $("#toggle-shared-missions").toggleClass("active");
    bool_show_campaign = !bool_show_campaign;
    if (bool_show_campaign)
    {
        $('#shared-missions').css('visibility', 'visible');
    }
    else
    {
        $('#shared-missions').css('visibility', 'hidden');
    }
}

/**
 * Gather all data on the mission being launched
 * @param {bool_debug_on} activate/deactivate debug log
 * @return {mission} A mission object containing all mission parameters (type, time, localizations, fleet)
 */
function getMissionData()
{
    // Initialize blank mission
    var mission =
    {
        "type": "unknown", // "Pillage", "Colonisation" or "Conquête"
        "source_player": "unknown", // Player's pseudonyme
        "source_planet_name": "unknown", // Player's currently seleted planet name
        "source_planet_x": 0, // planet center x coordinate on canvas
        "source_planet_y": 0, // planet center y coordinate on canvas
        "target_player": "unknown", // Opponent's pseudonyme or "Rebelle"
        "target_planet_name": "unknown", // Opponent's planet name or "Planète rebelle"
        "target_planet_x": 0, // planet center x coordinate on canvas
        "target_planet_y": 0, // planet center y coordinate on canvas
        "duration": 0, // string of format "hh:mm:ss"
        "time_launched": 0, // time when launch button is pressed
        "time_arrived": 0, // launch time + duration
        "fleet_rank_commander": 0, // max pev == rank * 100
        "fleet_pev": 0, // total pev assigned to fleet
        "fleet_ships": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] // fleet composition [Pégase, Satyre, Chimère, Sirène, Dryade, Méduse, Griffon, Cyclope, Minotaure, Hydre, Cerbère, Phénix]
    };
    // Scrap data from current page
    var launch_button_text = $('#action-box li.active+li div.commander-tile div.move a.button').html();
    if (launch_button_text.includes("colonisation"))
    {
        mission.type = "Colonisation";
    }
    else if (launch_button_text.includes("conquête"))
    {
        mission.type = "Conquête";
    }
    else
    {
        mission.type = "Pillage";
    }
    mission.source_player = $('head title').html().split(" ")[2];
    mission.source_planet_name = $('#nav a.current-base img').attr("alt");
    mission.source_planet_x = $('#own-base circle:has(animate)').attr('cx');
    mission.source_planet_y = $('#own-base circle:has(animate)').attr('cy');
    mission.target_player = $('#action-box li.active+li span.player-name a').html();
    if (typeof mission.target_player == "undefined")
    {
        mission.target_player = "Rebelle";
    }
    mission.target_planet_name = $('#action-box li.active+li p strong').html();
    var target_planet = $('#systems a.loadSystem.active');
    mission.target_planet_x = target_planet.attr('style').match(/left: [0-9]+/)[0].replace(/left: /, "") * 1 + 10;
    mission.target_planet_y = target_planet.attr('style').match(/top: [0-9]+/)[0].replace(/top: /, "") * 1 + 10;
    mission.duration = $('#action-box li.active+li div.commander-tile div.move').html().match(/Temps de l'attaque : [0-9]+:[0-9]+:[0-9]+/)[0].replace(/Temps de l'attaque :/, "");
    var mission_duration_h = mission.duration.split(":")[0];
    var mission_duration_m = mission.duration.split(":")[1];
    var mission_duration_s = mission.duration.split(":")[2];
    mission.time_launched = new Date();
    mission.time_arrived = new Date(mission.time_launched.getTime() + 1000 * (mission_duration_h * 3600 + mission_duration_m * 60 + mission_duration_s * 1));
    mission.fleet_rank_commander = $('#subnav a.map-commander.active span.picto span.number').html();
    mission.fleet_pev = $('#subnav a.map-commander.active span.sub-content').html().match(/[0-9]+ pev/)[0].replace(/pev/, "");
    mission.fleet_ships = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < 12; i++)
    {
        mission.fleet_ships[i] = $('#subnav a.map-commander.active span.sub-content span.ship:nth-of-type(' + (i + 1) + ') span.number').html();
    }
    // Print debug info
    if (bool_debug_on === true)
    {
        console.log('!!! DEBUG: MISSION DATA !!!');
        console.log('mission.type: ' + mission.type);
        console.log('mission.source_player: ' + mission.source_player);
        console.log('mission.target_player: ' + mission.target_player);
        console.log('mission.source_planet_name: ' + mission.source_planet_name);
        console.log('mission.source_planet_x: ' + mission.source_planet_x);
        console.log('mission.source_planet_y: ' + mission.source_planet_y);
        console.log('mission.target_planet: ' + mission.target_planet);
        console.log('mission.target_planet_x: ' + mission.target_planet_x);
        console.log('mission.target_planet_y: ' + mission.target_planet_y);
        console.log('mission.duration: ' + mission.duration);
        console.log('mission.time_launched: ' + mission.time_launched);
        console.log('mission.time_arrived: ' + mission.time_arrived);
        console.log('mission.fleet_rank_commander: ' + mission.fleet_rank_commander);
        console.log('mission.fleet_pev: ' + mission.fleet_pev);
        console.log('mission.fleet_ships: ' + mission.fleet_ships);
        console.log('!!! END DEBUG: MISSION DATA !!!');
    }
    return mission;
}

/**
 * Store a new mission in the database
 * @param {mission} The mission object to add
 */
function pushNewMission(new_mission)
{
    $.get(bdd_url, function(data, status) {
        switch (new_mission.type)
        {
            case "Pillage":
                data.plunderings.push(new_mission);
                break;
            case "Colonisation":
                data.colonizations.push(new_mission);
                break;
            case "Conquête":
                data.conquests.push(new_mission);
                break;
            default:
                data.plunderings.push(new_mission);
                break;
        }
        $.ajax({
            url: bdd_url,
            type:"PUT",
            data: JSON.stringify(data),
            contentType:"application/json; charset=utf-8",
            dataType:"json",
            success: function()
            {
                console.log(">>> New entry successfuly pushed to database!");
            }
        });
    }).then(updateSharedMissions);
}

/**
 * Refresh the content of the shared mission div
 * TODO: update only the diff since last call
 */
function updateSharedMissions()
{
    // reset the display
    $('#shared-missions svg').empty();
    var svg_plunderings = $('#shared-missions svg.plunderings');
    var svg_colonizations = $('#shared-missions svg.colonizations');
    var svg_conquests = $('#shared-missions svg.conquests');
    $.get(bdd_url, function(data, status) {
        var new_svg_line = "";
        // for each entry, add a line to the SVG div
        for (i = 0; i < data.plunderings.length; i++)
        {
            new_svg_line = document.createElementNS('http://www.w3.org/2000/svg', "line");
            new_svg_line.setAttribute('x1', data.plunderings[i].source_planet_x);
            new_svg_line.setAttribute('x2', data.plunderings[i].target_planet_x);
            new_svg_line.setAttribute('y1', data.plunderings[i].source_planet_y);
            new_svg_line.setAttribute('y2', data.plunderings[i].target_planet_y);
            // add the mission to the right category
            switch (data.plunderings[i].type)
            {
                case "Pillage":
                    svg_plunderings.append(new_svg_line);
                    break;
                case "Colonisation":
                    svg_colonizations.append(new_svg_line);
                    break;
                case "Conquête":
                    svg_conquests.append(new_svg_line);
                    break;
                default:
                    svg_plunderings.append(new_svg_line);
                    break;
            }
        }
    });
}

function getMissionsFromCoordinates(system_x, system_y)
{
    $.get(bdd_url, function(data, status) {
        // convert data to array
        var system_missions = $.map(data, function(el) { return el;});
        // filter the missions corresponding to this system
        system_missions = $.grep(system_missions, function(el, index)
        {
            return (el.target_planet_x === system_x && el.target_planet_y === system_y);
        });
        // for each mission, display a summary
        if (system_missions.length > 0)
        {
            var system_id = "systemX" + system_x + "Y" + system_y;
            // create new table if not existing
            console.log($('#' + system_id));
            if ($('#' + system_id).length === 0)
            {
                $('#shared-missions-info').append('<table id="' + system_id + '"></table>');
                $('#' + system_id).css("color", "white");
                $('#' + system_id).css("width", "auto");
                $('#' + system_id).css("position", "absolute");
                $('#' + system_id).css("border", "1px solid white");
                $('#' + system_id).css("border-collapse", "collapse");
                $('#' + system_id).css("top", system_y);
                $('#' + system_id).css("left", system_x);
                $('#' + system_id).append('<thead><tr><th>Attaquant</th><th>Cible</th><th>Arrivée</th></tr></thead>');
            }
            $('#' + system_id + ' tbody').empty();
            $.each(system_missions, function(index, value)
            {
                $('#' + system_id).append('<tr><td>' + value.source_player + '</td><td>' + value.target_planet_name + '</td><td>' + value.time_arrived + '</td></tr>');
            });
        }
    });
}

/**
 * Remove from the database all missions that finished
 * TODO: include terminating option if player cancels a missions
 */
function databasePurge()
{
}

/**
 * Reset the database to an empty state
 */
function databaseReset()
{
    var initial_data =
    {
        "plunderings": [],
        "colonizations": [],
        "conquests": []
    };
    // reset database
    $.get(bdd_url, function(data, status) {
        $.ajax({
            url: bdd_url,
            type:"PUT",
            data: JSON.stringify(initial_data),
            contentType:"application/json; charset=utf-8",
            dataType:"json",
            success: function()
            {
                console.log(">>> Database successfuly reset !");
            }
        });
    }).then(updateSharedMissions);
}