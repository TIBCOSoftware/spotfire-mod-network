/*
 * Copyright © 2020. TIBCO Software Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */

//@ts-ignore
import * as d3 from "d3";
import * as tinycolor from "tinycolor2";

/**
 * Main svg container
 */
let svg = d3.select("#mod-container").append("svg").attr("xmlns", "http://www.w3.org/2000/svg");

/**
 * On click event for network controls to toggle visibility
 */
let control_onclick = d3.select("#network-settings").on("click", function(){
    let currently_visible = d3.select("#showhide-controls").style("display");
    d3.select("#showhide-controls").style("display", function() {
        return (currently_visible == "none") ? "block" : "none";
    });
});

const Spotfire = window.Spotfire;

/**
 * Get access to the Spotfire Mod API by providing a callback to the initialize method.
 * @param {Spotfire.Mod} mod - mod api
 */
Spotfire.initialize(async (mod) => {
 
    /**
    * Series of  defaults
    */
    let default_line_width = 1;
    let default_distance = 30;
    let default_node_size = 4
    let default_text_size = 9;
    let default_label_color = 'black';
    let label_limit = 1000;
    let current_zoom_scale = 1;
    let current_row_count = 0;
    let default_color = 'gray'
    let default_link_color = 'silver'
    let marking_darken = 25;

    // style of network graph force: centering or positioning
    // not currently in use
    let force_type = "centered"

    /**
     * The following block contains helper functions for working with spotfire data
     */


    /**
     * Generates a Boolean for each axis to determine it is categorical or not
     * @param {Spotfire.DataViewRow} row, {String} column_name, {Spotfire.DataViewAxis} axes
     */ 
    const determine_axes_types = (axes) => {

        let axis_names = ["Source", 
                          "Target",
                          "Size By",
                          "Line Width",
                          "Distance",
                          "Other Color",
                          "End Node Size By",
                          "End Node Color By",
                          "Label By",
                          "Label Size By",
                          //"Additional Columns",
                          "Label Color By",
                          "Color"
                         ];

        let axes_found = {};

        axis_names.forEach((column_name) => {

            let axis = axes.find(column => column.name == column_name);
            if(axis != null){
                axes_found[column_name] = axis.isCategorical;
            } else {
                axes_found[column_name] = null;
            }

        });

        return axes_found;

    };


    /**
     * Checks for data type and returns 
     * @param {Spotfire.DataViewRow} row, {String} column_name
     */ 
    const get_row_data = (row, column_name) => {

        let column_type = axes[column_name];
        let result = null;

        // test if we have a categorical column
        if (column_type == true){
            result = row.categorical(column_name).formattedValue();
        } 
        else if (column_type == false) {
            result = parseFloat(row.continuous(column_name).value());
        }

        return result;
    };


    /**
     * Creates a new link object for network nodes
     * @param {Spotfire.DataViewRow} row, Object link
     */
    const create_node = (row, link) => ({
            id: get_row_data(row, "Source"),
            //group: Color(row),
            color: row.color().hexCode,
            other_color: get_row_data(row, "Other Color"),
            size_by: get_row_data(row, "Size By"),
            label_by: get_row_data(row, "Label By"),
            label_size_by: get_row_data(row, "Label Size By"),
            spotfire_marked: row.isMarked(),
            internal_marked: is_marked(get_row_data(row, "Source")),
            //additional_columns: get_row_data(row, "Additional Columns"),
            show_label: true,
            label_color_by:  get_row_data(row, "Label Color By"),
            end_node: false,
            links: [link]
    });

    
    /**
     * Creates a new link object for network links
     * @param {Spotfire.DataViewRow} row
     */
    const create_link = (row) => ({
        source: get_row_data(row, "Source"),
        target: get_row_data(row, "Target"),
        value: get_row_data(row, "Line Width"),
        distance: get_row_data(row, "Distance"),
        color: row.color().hexCode,
        other_color: get_row_data(row, "Other Color"),
        end_node_size_by: get_row_data(row, "End Node Size By"),
        end_node_color_by: get_row_data(row, "End Node Color By")
    });    


    /**
     * Creates an array of node objects for network chart
     * @param {Spotfire.DataViewRow[]} rows
     */
    const create_nodes_and_links = (rows) => {

        let new_nodes = [];
        let node_names = new Set();

        let new_links = [];
        let links_created = new Set();

        // add nodes from Source
        rows.forEach((row) => {

            // create the link
            var new_link = create_link(row);
            if (new_link.target != null){

                // check if its a duplicate
                if (!links_created.has({id: new_link.source, id2: new_link.target}) &&  !links_created.has({id: new_link.target, id2: new_link.source}))
                {
                    new_links.push(new_link);
                }
                links_created.add({id: new_link.source, id2: new_link.target})
                links_created.add({id: new_link.target, id2: new_link.source})
            }

            // now create the node
            var new_node = create_node(row, new_link)

            // check if the node already exists
            if(!node_names.has(new_node.id))
            {
                // add in links data
                node_names.add(new_node.id);
                new_nodes.push(new_node);

                if(new_node.label_color_by){
                    default_label_color = new_node.label_color_by;
                }
            } else{
                // find the node in array of nodes, and add the new node
                let this_node_id = new_nodes.findIndex(node => node.id === new_node.id);
                if (this_node_id != -1){
                    // push in the new node - this is to ensure the last row of data is always used as the node properties
                    // This is due to aggregation issues as documented where often a node can have multiple values for a single property
                    new_nodes[this_node_id] = new_node;
                    new_nodes[this_node_id].links.push(new_link);
                    // update coloring as it may need altered if nodes are marked
                    new_nodes[this_node_id].color = get_color(new_node);
                } else {
                    console.log(this_node_id);
                }
            }
        });

        let link_names = new Set(new_links.map(l => l.target));
        // Need to check there are no values in column 2 which are not in column 1
        let node_differences = new Set([...link_names].filter(x => !node_names.has(x)))
        // if there are - create nodes for them
        node_differences.forEach((this_name) => {

            // now find the node(s) attached to this link
            let link = new_links[new_links.findIndex(links => links.target === this_name)];
            // get the node attached to the end node
            // let this_node = new_nodes[new_nodes.findIndex(node => node.id === link.source)];

            // let target_node = this_node.links[this_node.links.findIndex(link => link.target == this_name)]

            var new_node = { id: this_name, 
                            //group: null,
                            size_by: null,
                            color: link.end_node_color_by,
                            end_node_size_by: link.end_node_size_by,
                            spotfire_marked: false,
                            internal_marked: is_marked(this_name),
                            label_color_by: default_label_color,
                            end_node: true,
                            links: []
                           }
            
            // now update the color
            new_node.color = get_color(new_node);                
            new_nodes.push(new_node);
        });

        // convert back to array
        //let node_array = Array.from(nodes) 
        return({nodes: new_nodes, links: new_links});
    };


    /**
     * Creates an array of links objects for network chart
     * @param {Spotfire.DataViewRow[]} rows, Array nodes, Array links
     */
    const update_nodes_and_links = (rows, nodes, links) => {
        rows.forEach((row) => {

            var updated_link = create_link(row);
            // get relevant node
            let link_id = links.findIndex(obj => obj.source.id == updated_link.source &  obj.target.id == updated_link.target)

            // update current node
            if (link_id !== -1){

                // reassign the properties needed
                links[link_id].color = updated_link.color; 
                links[link_id].value = updated_link.value; 
                links[link_id].distance = updated_link.distance; 
                links[link_id].other_color = updated_link.other_color; 
                links[link_id].end_node_size_by = updated_link.end_node_size_by;
                links[link_id].end_node_color_by = updated_link.end_node_color_by;
            }

            var updated_node = create_node(row)
            // get relevant node
            let node_id = nodes.findIndex(obj => obj.id == updated_node.id)

            // update current node
            if (node_id !== -1){

                //nodes[node_id].marked = marked_rows.has(updated_node.id);
                nodes[node_id].marked = is_marked(updated_node.id);
                nodes[node_id].color = get_color(updated_node);
                nodes[node_id].other_color = updated_node.other_color;
                nodes[node_id].size_by = updated_node.size_by;
                nodes[node_id].label_by = updated_node.label_by;
                nodes[node_id].label_color_by = updated_node.label_color_by;
                nodes[node_id].label_size_by = updated_node.label_size_by;
                //nodes[node_id].additional_columns = updated_node.additional_columns;  
            }
        });

        // node handle end nodes
        for (var [key, node] of Object.entries(nodes)){

            if (node.end_node == true){
                // now find the node(s) attached to this link
                let this_link = links[links.findIndex(links => links.target.id === node.id)];
                // get the node attached to the end node
                //let target_node = nodes[nodes.findIndex(node => node.id === this_link.source.id)];

                node.end_node_size_by = this_link.end_node_size_by
                node.color = this_link.end_node_color_by;
                node.internal_marked = is_marked(node.id)
                node.spotfire_marked = false;

                // update color for marking
                node.color = get_color(node);

                // update array
                nodes[key] = node;
            }
        }

        return({nodes: nodes, links: links});
    }

    /**
     * Get the color for each node (helps handling marking)
     * @param Array nodes
     */    
     const get_color = (node) => {

        var node_color = node.color;
        if (node.end_node == false && node.spotfire_marked == false && node.internal_marked == true){
                node_color = tinycolor(node.color).darken(marking_darken).toString();
        } else if (node.end_node == true){
            let end_node_color = node.color == null ? default_color : node.color;
            if (marked_rows.size > 0){           
                if (is_marked(node.id) !== true){
                    node_color = tinycolor(end_node_color).lighten(35).toString();
                } 
            } else {
                node_color = end_node_color;
            } 
        }
        return node_color;
    }

    /**
     * Generate a unique set of row ids that are marked
     * @param {Spotfire.DataViewRow[]} rows
     */
     const get_marked_rows = (rows) => {

        let marked_rows = new Set();

        rows.forEach((row) => {
            if (row.isMarked()){
                marked_rows.add(get_row_data(row, "Source"))
                marked_rows.add(get_row_data(row, "Target"))
            }
        });  

        return marked_rows;
    };


    /**
     * Generate a unique set of row ids that are marked
     * @param string id, string link_id
     */    
    const is_marked = (id) => {
        return marked_rows.has(id);
    }

        /**
     * Creates an array of links objects for network chart
     * @param Array marked_node, {Spotfire.DataViewRow[]} rows
     */
    const mark_rows = (marked_node, rows) => {
        
        let id_column = "Source"
        if (marked_node.end_node == true){
            id_column = "Target"        
        }

        rows.forEach((row) => {
            let id = get_row_data(row, id_column)
            if (marked_node.id == String(id)){
                row.mark(d3.event.ctrlKey ? "ToggleOrAdd" : "Replace")
            } 
        });

    }

    /**
     * Function to limit number of labels shown
     * @param Array nodes
     */
     const limit_labels = (nodes) => {

        if (nodes.length > label_limit){

            // take biggest nodes if available
            if (axes["Size By"] != null){
                let sizes = nodes.map(n => n.size_by)
                sizes = sizes.sort((a, b) => b - a);
                let size_limit = sizes[label_limit];
                nodes.forEach((this_node) => {
                    if (this_node.size_by >= size_limit){
                        this_node.show_label = true;
                    } else {
                        this_node.show_label = false;
                    }
                })
            }
            else { // if its categorical just go in order of data
                let i = 1;
                nodes.forEach((this_node) => {
                    if (i <= label_limit){
                        this_node.show_label = true;
                    } else {
                        this_node.show_label = false;
                    }
                    i++;
                });
            }

        }
        return(nodes);
    }

   /**
     * Wrap a reader with an additional method called `hasChanged`.
     * It allows you to check whether a value is new or unchanged since the last time the subscribe loop was called.
     * @function
     * @template A
     * @param {A} reader
     * @returns {A & {hasValueChanged(value: any):boolean}}
     */
    function readerWithChangeChecker(reader) {
        let previousValues = [];
        let currentValues = [];
        function compareWithPreviousValues(cb) {
            return function compareWithPreviousValues(...values) {
                previousValues = currentValues;
                currentValues = values;
                return cb(...values);
            };
        }
        return {
            ...reader,
            subscribe(cb) {
                // @ts-ignore
                reader.subscribe(compareWithPreviousValues(cb));
            },
            hasValueChanged(value) {
                return previousValues.indexOf(value) == -1;
            }
        };
    }

    /**
     * Create the read function.
     */
    const reader = readerWithChangeChecker(mod.createReader(mod.visualization.data(), 
                                    mod.windowSize(), 
                                    mod.visualization.mainTable(),
                                    mod.visualization.axis("Source"),
                                    mod.visualization.axis("Target"),
                                    mod.property("network_strength"), 
                                    mod.property("display_labels"),
                                    mod.property("network_type"),
                                    mod.property("apply_color"),
                                    mod.property("aggregation_warning"),
                                    ));

    /**
     * Store the context.
     */
    const context = mod.getRenderContext();

    // adjust label colors based upon theme background
    default_label_color = tinycolor.mostReadable(context.styling.general.backgroundColor, ["#000000"], {includeFallbackColors:true});

    /**
    * Define vars we want to use for creating and updating network
    */
    let nodes, node, links, axes, link, node_text, g, marked_rows;

    /**
     * Initiate the read loop
     */
    reader.subscribe(render);

    /**
     * @param {Spotfire.DataView} data_view
     * @param {Spotfire.Size} window_size
     * @param {Spotfire.DataTable} main_data_table
     * @param {Spotfire.DataTable} source
     * @param {Spotfire.DataTable} target
     * @param {Spotfire.ModProperty<integer>} network_strength
     * @param {Spotfire.ModProperty<boolean>} display_labels
     * @param {Spotfire.ModProperty<string>} network_type
     * @param {Spotfire.ModProperty<string>} apply_color
     * @param {Spotfire.ModProperty<string>} aggregation_warning
     */
    async function render(data_view, window_size, main_data_table, source, target, network_strength, display_labels, network_type, apply_color, aggregation_warning) {
        /**
         * Check the data view for errors
         */
        let errors = await data_view.getErrors();

        if (errors.length > 0) {
            // Showing an error overlay will hide the mod iframe.
            // Clear the mod content here to avoid flickering effect of
            // an old configuration when next valid data view is received.
            mod.controls.errorOverlay.show(errors);
            return;
        }
        mod.controls.errorOverlay.hide();

        // Handle mouse events for marking
        svg.on("click", (e) => {
            data_view.clearMarking();
        });

        // configure network strength and controls
        let this_network_strength = network_strength.value();
        d3.select("#strength_slider").property('value', -1 * this_network_strength);

        // Listen to the strength slider
        d3.select("#strength_slider").on("change", function(d){
            network_strength.set(-1 * this.value);
        })
        
        // configure display labels and controls
        let this_display_labels = display_labels.value();
        d3.select("#label_checkbox").property('checked', this_display_labels);  

        // Listen to the label checkbox
        d3.select("#label_checkbox").on("click", function(){
            display_labels.set(this.checked);
        })

        // configure network type and controls
        let this_network_type = network_type.value();
        d3.select("#network_type_dd").property('value', this_network_type);  

        // Listen to the label checkbox
        d3.select("#network_type_dd").on("change", function(){
            network_type.set(this.value);
        })

        // configure apply color and controls
        let this_apply_color = apply_color.value();
        d3.select("#apply_color_dd").property('value', this_apply_color);  

        // Listen to the label checkbox
        d3.select("#apply_color_dd").on("change", function(){
            apply_color.set(this.value);
        })

        // Warning for aggregations settings
        
         d3.select("#aggregation_warning").on("click", function(){
            aggregation_warning.set(false);
            d3.select("#error_container").style("display", "none");
        })       

        /**
         * Get rows from data_view
         */
        const rows = await data_view.allRows();
        const data_axes = await data_view.axes();
        const new_row_count = await data_view.rowCount();

        // check for aggregations
        let this_aggregation_warning = false;

        // check mod property to see if warning has been acknowledged
        if (aggregation_warning.value() == true){
            for (var axis of data_axes){
                var this_axis = await mod.visualization.axis(axis.name);
                if (this_axis.expression.includes("([")){
                    this_aggregation_warning = true;
                    break;
                }
            }
        }
        
        // check what has changed
        let data_requires_update = false;
        let simulation_requires_update = false;
        let window_requires_update = false;
        let rendering_requires_update = false;

        if (reader.hasValueChanged(main_data_table)
            || reader.hasValueChanged(source)
            || reader.hasValueChanged(target)
            || new_row_count != current_row_count){
            data_requires_update = true;
            simulation_requires_update = true;
            current_row_count = new_row_count;
        } 

        if (reader.hasValueChanged(network_strength)
            || reader.hasValueChanged(network_type))
        {
            simulation_requires_update = true;
        }

        if (reader.hasValueChanged(window_size)){
            window_requires_update = true;
        } 

        if (reader.hasValueChanged(display_labels)
            || reader.hasValueChanged(apply_color)
            || reader.hasValueChanged(data_view))
        {
            rendering_requires_update = true;
        }

        // trigger loading network
        updateNetwork(data_requires_update, 
                      simulation_requires_update, 
                      window_requires_update, 
                      rendering_requires_update);

        /**
         * Signal that the mod is ready for export.
         */
        context.signalRenderComplete();

        function updateWindow(){

            /**
             * Sets the viewBox to center in Spotfire visual
             */
            svg.attr("viewBox", [-window_size.width / 2, -window_size.height / 2, window_size.width, window_size.height])

        }

        // update function for changes
        function updateNetwork(data_requires_update, simulation_requires_update, window_requires_update, rendering_requires_update){

            // always check axis types in case they have changed
            axes = determine_axes_types(data_axes);

            // get marked rows
            marked_rows = get_marked_rows(rows);
            if (marked_rows.length > 0){
                default_color = tinycolor(default_color).lighten(marking_darken).toString();
            }

            if (data_requires_update){            
                if (rows == null) {
                    // User interaction caused the data view to expire.
                    // Don't clear the mod content here to avoid flickering.
                    return;
                }

                //links = create_links(rows, axes);
                let nodes_and_links = create_nodes_and_links(rows);
                nodes = nodes_and_links.nodes;
                links = nodes_and_links.links;

                // check number of nodes and text - if above the limit, reduce labels
                if (axes["Label By"] != null){
                    nodes = limit_labels(nodes)
                }
            } 

            // display warning if first time aggregations have been detected
            if (this_aggregation_warning){
                d3.select("#error_container")
                    .style("display", "block");
            }

            // Has the window size changed?
            if (window_requires_update){
                updateWindow();
            }

            // Has the a property changed i.e the data thast requires a new simulation
            if (simulation_requires_update){

                // clear out current svg content
                svg.selectAll("*").remove();

                // append a child element to fix zoom issues
                g  = svg.append("g")
                    .attr("width", window_size.width)
                    .attr("height", window_size.height);  

                const zoom = d3.zoom()
                        //.scaleExtent([1, 40])
                        .on("zoom", zoomed);
    
                // add zoom to chart
                svg.call(zoom);

                // Reapply zoom from previous render if it existed
                svg.call(zoom.transform, d3.zoomIdentity.scale(current_zoom_scale));

                /**
                 * Sets the simulation and forces for the network
                 */
                var simulation = d3.forceSimulation()
                    .force("link", d3.forceLink().id(function(d) { return d.id;  }).distance(default_distance))
                    .force("charge", d3.forceManyBody().strength(this_network_strength))
                    .force("x", d3.forceX())
                    .force("y", d3.forceY())

                if (this_network_type == "static"){
                    simulation.stop();  
                }
                    
                // set simulation nodes links and properties
                simulation
                    .nodes(nodes)
                    .on("tick", ticked)
                    .alphaDecay(0.0295)
                    .force("link")
                    .links(links);

                // do we want to suspend the animation - useful for streaming/static analysis
                if (this_network_type == "static"){
                    simulation.tick(600);
                }

                // line rendering
                link = g.append("g")
                    .attr("class", "links")
                    .selectAll("line")
                    .data(links)
                    .enter().append("line")
                    .attr("x1", function(d) { return d.source.x; })
                    .attr("y1", function(d) { return d.source.y; })
                    .attr("x2", function(d) { return d.target.x; })
                    .attr("y2", function(d) { return d.target.y; });

                link.exit().remove()

                // node rendering
                node = g.append("g")
                    .attr("class", "nodes")
                    .selectAll("circle")
                    .data(nodes)
                    .enter().append("circle")
                    .attr("cx", function(d) { return d.x; })
                    .attr("cy", function(d) { return d.y; })
                    .call(d3.drag()
                        .on("start", dragstarted)
                        .on("drag", dragged)
                        .on("end", dragended));

                node.append("title")
                        .text(function(d) { return d.id; });

                node.exit().remove();

                node_text = g.append('g')
                    .selectAll('text')
                    .data(nodes)
                    .enter().append('text')
                    .attr("x", node => node.x)
                    .attr("y", node => node.y);
                    
                function ticked() {
                    link
                        .attr("x1", function(d) { return d.source.x; })
                        .attr("y1", function(d) { return d.source.y; })
                        .attr("x2", function(d) { return d.target.x; })
                        .attr("y2", function(d) { return d.target.y; });
                    node
                        .attr("cx", function(d) { return d.x; })
                        .attr("cy", function(d) { return d.y; });
                    node_text
                        .attr("x", function(d) { return d.x; })
                        .attr("y", function(d) { return d.y; });
                }

            }

            if (simulation_requires_update || rendering_requires_update){

                if (!data_requires_update){
                    let updated_data = update_nodes_and_links(rows, nodes, links);
                    links = updated_data.links;
                    nodes = updated_data.nodes;
                }

                // Labels for nodes
                node_text = d3.select('g')
                        .selectAll('text')
                        .data(nodes)
                        .text(get_label_by)
                        .attr('dx', get_text_position)
                        .attr('font-size', get_label_size)
                        .attr('alignment-baseline', 'middle')
                        .attr("text-anchor", "right")
                        .attr('stroke-width', '0')
                        .attr('fill', get_text_color);

                node_text.exit().remove();

                // set color for nodes and links
                node = d3.select('g')
                    .selectAll("circle")
                    .data(nodes)
                    .attr("stroke-width", 0.075)
                    .attr("r", get_size_by)
                    .attr("fill", get_node_color)                       
                    .on('mouseover',function() {
                        d3.select(this)
                            .transition()
                            .duration(10)
                            .attr('stroke-width', 0.3)
                            .attr('stroke', default_label_color)
                      })
                    .on('mouseout',function () {
                        d3.select(this)
                          .transition()
                          .duration(10)
                          .attr('stroke-width',0)
                    });

                node.on("click", (d) => {
                    mark_rows(d, rows);
                    d3.event.stopPropagation();
                });

                node.selectAll("title")
                    .text(function(d) { return d.id; });

                node.exit().remove();

                // line rendering
                link = d3.select('g')
                    .selectAll("line")
                    .data(links)
                    .attr("stroke-width", get_line_width)
                    .attr("stroke", get_link_color)
                    .attr("fill", get_link_color);

                link.exit().remove();
            }

            /**
             * Render helper functions
             */
            function zoomed() {
                g.attr("transform", d3.event.transform);
                // store current zoom
                current_zoom_scale = d3.event.transform.k;
            }

            function get_label_by(d){
                return this_display_labels ? d.label_by == null ? d.id : d.label_by : null;
            }

            function get_distance(){
                return d => d.distance == null ? default_distance : d.distance;
            }

            function get_size_by(d){

                if (d.size_by != null){
                    return d.size_by;
                } else if (d.end_node_size_by != null) {
                    return d.end_node_size_by;
                }
                return default_node_size;
            }

            function get_label_size(d){
                return d.label_size_by == null ? default_text_size : d.label_size_by;
            }

            function get_text_color(d){
                return d.label_color_by == null ? default_label_color : d.label_color_by;
            }

            function get_text_position(d){
                const shift_right = 1
                return d.size_by == null ? default_node_size + shift_right: d.size_by + shift_right;
            }

            function get_line_width(d){
                return d.value == null ? default_line_width : d.value;
            }
            
            function get_node_color(d) {

                if (this_apply_color == "nodes"){
                    return d.color == null ? default_color : d.color; 
                } else {
                    return d.end_node == false ? d.other_color == null ? default_color : d.other_color : d.color;
                }

            }
            
            function get_link_color(d) {

                if (this_apply_color == "links"){
                    return d.color == null ? default_link_color : d.color; 
                } else {
                    return d.other_color == null ? default_link_color : d.other_color; 
                }

            }     

            /*function get_tooltip(d) {
                return d.additional_columns == null ? d.id : d.id + "\n" + d.additional_columns.replace(/ ?\>\> ?/g,"\n"); 
            }*/

            function dragstarted(d) {
                if (!d3.event.active) { 
                    simulation.alphaTarget(0.1).restart(); 
                }
                //d3.event.sourceEvent.stopPropagation();
                //d3.select(this).attr("cx", d.x = d3.event.x).attr("cy", d.y = d3.event.y);
                d.fx = d.x;
                d.fy = d.y;
            }
            
            function dragged(d) {
                d.fx = d3.event.x;
                d.fy = d3.event.y;
            }

            function dragended(d) {
                if (!d3.event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }
        }
    }
});