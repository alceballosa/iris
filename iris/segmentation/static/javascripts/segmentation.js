/*Instead of 2D arrays we are going to use flattened 1D arrays for perfomance
reasons, i.e. array_2d[y][x] is going to be array_1d[y*row_length+x]*/


let commands = {
    "previous_image": {
        "key": "Backspace", "description": "Save this image and open previous one",
    },
    "next_image": {
        "key": "Return", "description": "Save this image and open next one",
    },
    "save_mask": {
        "key": "S", "description": "Save this mask",
    },
    "undo": {
        "key": "U", "description": "Undo last modification",
    },
    "redo": {
        "key": "R", "description": "Redo modification",
    },
    'select_class': {
        "key": "1 .. 9", "description": "Select class for drawing",
    },
    'tool_move': {
        "key": "W", "description": "Pan your current view by dragging and moving the cursor",
    },
    'tool_reset_views': {
        "key": "Z", "description": "Reset the view in the canvases",
    },
    'tool_draw': {
        "key": "D", "description": "Draw pixels on the mask",
    },
    'tool_eraser': {
        "key": "E", "description": "Erase previously drawn pixels",
    },
    "reset_mask": {
        "key": "N", "description": "Clear the whole mask",
    },
    "predict_mask": {
        "key": "A", "description": "Use the AI to help you filling out the mask",
    },
    "toogle_mask": {
        "key": "Space", "description": "Toggle mask on/off",
    },
    "mask_final": {
        "key": "F", "description": "Show the final mask combined from your pixels and the predictions by the AI",
    },
    "mask_user": {
        "key": "G", "description": "Show your drawn pixels only",
    },
    "mask_errors": {
        "key": "H", "description": "Show where the AI failed to predict correctly",
    },
    // "mask_highlight_edges": {
    //     "key": "B", "description": "Highlight edges on the masks",
    // },
    "toggle_contrast": {
        "key": "C", "description": "Toggle contrast on/off",
    },
    "toggle_invert": {
        "key": "I", "description": "Toggle inversion on/off",
    },
    "brightness_up": {
        "key": "Arrow-Up", "description": "Increase brightness (+10%)",
    },
    "brightness_down": {
        "key": "Arrow-Down", "description": "Decrease brightness (-10%)",
    },
    "saturation_up": {
        "key": "Arrow-Right", "description": "Increase saturation (+50%)",
    },
    "saturation_down": {
        "key": "Arrow-Left", "description": "Decrease saturation (-50%)",
    },
    "reset_filters": {
        "key": "X", "description": "Reset all image filters",
    },
};

// {
// "name": "Cirrus",
// "description": "High snowy or icy mountain regions and high clouds are <b>white</b>.",
// "channels": ["B11*100", "B11*100", "B11*100"]
// },

function init_segmentation(){
    // Before we start, we check for the login, etc.
    vars.next_action = init_canvases;
    fetch_server_update();
}

function init_canvases(){
    // Make some performance optimisations and add transformation tracker
    for (let canvas of document.getElementsByClassName("view-canvas")){
        // Here we set the resolution of the canvas in pixels. By setting
        // it to the actual size of the canvas (apparently .scrollWidth gives
        // the actual screen size in pixels) we make sure there are no blurring
        // effects.
        canvas.width = 300;
        canvas.height = 300;

        // To avoid any blurring of the images or masks, we disable smoothing
        var context = canvas.getContext("2d");
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = 0;
        context.shadowColor = null;
        context.imageSmoothingEnabled = false;

        // Track transformations done to the canvas (like zooming and paning)
        trackTransforms(context);
    }

    // It much faster to change some pixel values on a sprite and draw it then
    // to the canvas once than redrawing each pixel to the canvas directly.
    // Hence, we use a hidden canvas for the mask:
    vars.hidden_mask = document.createElement('canvas');
    vars.hidden_mask.width = vars.mask_shape[0];
    vars.hidden_mask.height = vars.mask_shape[1];
    let hidden_ctx = vars.hidden_mask.getContext('2d');
    hidden_ctx.shadowOffsetX = 0;
    hidden_ctx.shadowOffsetY = 0;
    hidden_ctx.shadowBlur = 0;
    hidden_ctx.shadowColor = null;
    hidden_ctx.imageSmoothingEnabled = false;

    // Load mask:
    load_mask();

    // Load the images and draw them when ready
    for (var i=0; i < vars.views.length; i++){
        if (!view_is_image(vars.views[i])){
            set_view_iframe(i);
            continue;
        }

        // We will later overwrite vars.images
        vars.images[i] = new Image();
        vars.images[i].src = vars.url.main+"image/" + vars.image_id + "/" + i;
        vars.images[i].onload = render_image.bind(null, i, true);
    }

    set_tool(vars.tool.type);
    set_current_class(vars.current_class);

    init_events();
    init_toolbar_events();

    render_preview();
    reset_views();
}

async function set_view_iframe(i){
    let view = vars.views[i];

    if (view_is_image(view)){
        return;
    }
    // Default location
    let location = "0~0";

    // Check whetherthere was a location given in the metadata:
    let response = await fetch(
        vars.url.main+'metadata/'+vars.image_id
    );
    if (response.status < 400){
        let metadata = await response.json();
        if ("location" in metadata){
            location = metadata.location[0]+"~"+metadata.location[1];
        }
    }

    let canvas = get_object('canvas-0-image');
    let url = "https://www.bing.com/maps/embed?";
    url += "h="+canvas.scrollHeight;
    url += "&w="+canvas.scrollWidth;
    url += "&cp="+location;
    url += "&lvl=12&typ=d&sty=a&src=SHELL&FORM=MBEDV8";
    let iframe = get_object('canvas-'+i+'-iframe');
    iframe.src = url;
    iframe.height = canvas.scrollHeight;
    iframe.width = canvas.scrollWidth;
}

function init_events(){
    // Make all preview canvases sensitive to the user"s actions. Why preview?
    // Since they are the canvases on top:
    for (var i=0; i < vars.views.length; i++) {
        if (!view_is_image(vars.views[i])){
            continue;
        }

        var canvas = document.getElementById("canvas-"+i+"-preview");
        canvas.addEventListener("mousemove", mouse_move, false);
        canvas.addEventListener("mousedown", mouse_down, false);
        canvas.addEventListener("mouseup", mouse_up, false);
        canvas.addEventListener("mouseenter", mouse_enter, false);
        canvas.addEventListener("mousewheel", mouse_wheel, false);
        canvas.addEventListener("DOMMouseScroll", mouse_wheel, false);
    }

    document.body.onkeydown = key_down;
    document.body.onresize = handle_resize;
}

function init_toolbar_events(){
    let toolbuttons = document.getElementsByClassName("toolbutton");
    for (let toolbutton of toolbuttons) {
        if (toolbutton.id === null){
            continue;
        }
        let command_id = toolbutton.id.substr(3);
        if (command_id in commands){
            let text = commands[command_id].description;

            if ('key' in commands[command_id]){
                text = '<span class="key">'+commands[command_id].key+'</span> ' + text;
            }

            toolbutton.onmouseenter = show_message.bind(null, text, null);
            toolbutton.onmouseleave = hide_message.bind(null);
        }
    }
}

function handle_resize(){
    // Update the views that have external content
    for (var i=0; i < vars.views.length; i++){
        if (!view_is_image(vars.views[i])){
            set_view_iframe(i);
        }
    }
}

function login_finished(){
    fetch_server_update();
}

function logout_finished(){
    save_mask();
    goto_url(vars.url.segmentation+'?image_id='+vars.image_id);
}

async function fetch_server_update(){
    let response = await fetch(vars.url.user+"get/current");

    if (response.status == 403) {
        dialogue_login();
        return;
    }

    user = await response.json();

    let info_box = '<div class="info-box-top" style="position: relative;">';
    info_box += nice_number(user.segmentation.score);
    if (vars.user !== null && vars.user.id == user.id){
        // Check how much the score changed in comparison to the last time:
        let score_change = user.segmentation.score - vars.user.segmentation.score;

        if (score_change){
            score_change = nice_number(score_change);
            let colour = "red";

            if (user.segmentation.score > vars.user.segmentation.score){
                score_change = "+" + score_change;
                colour = "green";
            }

            info_box += '<span style="position: absolute; right: -10px; top: -25px; align-text: right;" class="tag '+colour+'">'+score_change+'</span>';
        }
    }
    info_box += '</div>';
    info_box += '<div class="info-box-bottom">'+clip_string(user.name, 25)+'</div>';
    get_object('user-info').innerHTML = info_box;
    vars.user = user;
    vars.config = user.config;

    if (user.admin){
        get_object('admin-button').style.display = "block";
    } else {
        get_object('admin-button').style.display = "none";
    }

    // Get more information about the current image:
    response = await fetch(vars.url.main+"image_info/"+vars.image_id);
    if (response.status != 404) {
        image = await response.json();

        info_box = '<div class="info-box-top" style="position: relative;">';
        info_box += clip_string(image.id, 20);
        if (image.n_segmentations != 0){
            // Check how much the score changed in comparison to the last time:
            let text = '1 mask';
            if (image.n_segmentations > 1){
                text = image.n_segmentations.toString() + ' masks';
            }

            info_box += '<span style="position: absolute; right: -10px; top: -25px; align-text: right;" class="tag">'+text+'</span>';
        }
        info_box += '</div>';
        info_box += '<div class="info-box-bottom">image</div>';
        get_object('image-info').innerHTML = info_box;
    }

    if (vars.next_action !== null){
        vars.next_action();
        vars.next_action = null;
    }
}

function key_down(event){
    let key = event.code;

    if (get_object('dialogue').style.display == "block"){
        // Don't allow any key events during an opened dialogue

    }else if (key == "Space"){
        show_mask(!vars.show_mask);
    } else if (key == "KeyS"){
        save_mask();
    } else if (key == "Enter"){
        save_mask(next_patch);
    } else if (key == "Backspace"){
        save_mask(prev_patch);
    } else if (key == "KeyU"){
        undo();
    } else if (key == "KeyR"){
        redo();
    } else if (key == "KeyC"){
        set_contrast(!vars.contrast);
    } else if (key == "KeyI"){
        set_invert(!vars.invert);
    } else if (key == "ArrowUp"){
        change_brightness(up=true);
    } else if (key == "ArrowDown"){
        change_brightness(up=false);
    } else if (key == "ArrowRight"){
        change_saturation(up=true);
    } else if (key == "ArrowLeft"){
        change_saturation(up=false);
    } else if (key == "KeyX"){
        reset_filters();
    } else if (key == "KeyA"){
        predict_mask();
    } else if (key == "KeyF"){
        set_mask_type("final");
    } else if (key == "KeyG"){
        set_mask_type("user");
    } else if (key == "KeyH"){
        set_mask_type("errors");
    } else if (key.startsWith("Digit") || key.startsWith("Numpad")){
        // Why do we subtract 1 from this? The class ids start with 0, so we
        // want to make the hotkey easier:
        var class_id = parseInt(key[key.length-1]) - 1;
        if (class_id < vars.classes.length){
            set_current_class(class_id);
        }
    } else if (key == "KeyD"){
        set_tool("draw");
    } else if (key == "KeyE"){
        set_tool("eraser");
    } else if (key == "KeyW"){
        set_tool("move");
    } else if (key == "KeyN"){
        dialogue_reset_mask();
    } else if (key == "KeyZ"){
        reset_views();
    }
}

function change_brightness(up){
    if (up){
        vars.brightness += 10;
        vars.brightness = Math.min(800, vars.brightness);
    } else {
        vars.brightness -= 10;
        vars.brightness = Math.max(0, vars.brightness);
    }
    render_images();
}
function change_saturation(up){
    if (up){
        vars.saturation += 20;
        vars.saturation = Math.min(800, vars.saturation);
    } else {
        vars.saturation -= 20;
        vars.saturation = Math.max(0, vars.saturation);
    }
    render_images();
}

function set_current_class(class_id){
    vars.current_class = class_id;
    var colour = vars.classes[class_id].colour;
    var css_colour = rgba2css(colour);
    get_object("tb_current_class").innerHTML = vars.classes[class_id].name;
    get_object("tb_select_class").style["background-color"] = css_colour;

    // Convenience - automatically change to drawing tool after selecting class:
    set_tool("draw");
}

function set_mask_highlight_edges(yes){
    vars.mask_highlight_edges = yes;

    if (vars.mask_highlight_edges){
        get_object("tb_mask_highlight_edges").classList.add("checked");
    } else {
        get_object("tb_mask_highlight_edges").classList.remove("checked");
    }

    render_mask();
    show_mask(true);
}

function set_contrast(visible){
    vars.contrast = visible;

    if (vars.contrast){
        get_object("tb_toggle_contrast").classList.add("checked");
    } else {
        get_object("tb_toggle_contrast").classList.remove("checked");
    }

    render_images();
}

function set_invert(visible){
    vars.invert = visible;

    if (vars.invert){
        get_object("tb_toggle_invert").classList.add("checked");
    } else {
        get_object("tb_toggle_invert").classList.remove("checked");
    }

    render_images();
}

function set_tool(tool){
    get_object("tb_tool_"+vars.tool.type).classList.remove("checked");
    get_object("tb_tool_"+tool).classList.add("checked");

    vars.tool.type = tool;

    render_preview();
}

function get_tool_offset(){
    /*Since we have draw with a tool, this returns the offset of the tool sprite*/
    if (vars.tool.size == 1){
        return {'x': 0, 'y': 0}
    }

    return {
        'x': round_number(-vars.tool.size/2),
        'y': round_number(-vars.tool.size/2),
    };
}

function mouse_wheel(event){
    var delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)));
    if (event.shiftKey){
        let canvas = get_object('canvas-0-image');
        // Change size of tool:
        vars.tool.size += delta * 0.5 * vars.tool.size;
        vars.tool.size = round_number(Math.max(
            1, Math.min(
                vars.tool.size, Math.max(...vars.mask_shape)
            )
        ));
        render_preview();
    } else {
        zoom(delta);
    }
}

function mouse_move(event){
    update_cursor_coords(this, event);
    if (
        (event.buttons == 2
        || event.buttons == 4
        || (event.buttons == 1 && vars.tool.type == 'move'))
        && vars.drag_start !== null
    ){
        move(
            vars.cursor_image[0]-vars.drag_start[0],
            vars.cursor_image[1]-vars.drag_start[1]
        );
    }

    // mouse left button must be pressed to draw
    if (event.buttons == 1 && vars.tool.type != 'move'){
        user_draws_on_mask();
    }

    // Show a preview of the pencil:
    render_preview();
}

function mouse_down(event){
    update_cursor_coords(this, event);

    if (event.buttons == 1 && vars.tool.type != 'move'){
        user_draws_on_mask();
        vars.drag_start = null;
    } else if (
        event.buttons == 2
        || event.buttons == 4
        || (event.buttons == 1 && vars.tool.type == 'move')
    ){
        vars.drag_start = [...vars.cursor_image];
    }
}

function mouse_up(event){
    vars.drag_start = null;
}

function mouse_enter(event){
    update_cursor_coords(this, event);
    if (
        event.buttons == 2
        || event.buttons == 4
        || (event.buttons == 1 && vars.tool.type == 'move')
    ){
        vars.drag_start = [...vars.cursor_image];
    }
}

function zoom(delta){
    let factor = Math.pow(1.1, delta);

    for (let canvas of document.getElementsByClassName('view-canvas')){
        let ctx = canvas.getContext('2d');
        // This makes sure that we zoom onto the current cursor position:
        ctx.translate(...vars.cursor_image);
        ctx.scale(factor, factor);
        ctx.translate(-vars.cursor_image[0], -vars.cursor_image[1]);

        constrain_view(ctx, factor, 0, 0);
    }
    update_views();
}

function move(dx, dy){
    if (dx == 0 && dy == 0){
        return;
    }

    for (let canvas of document.getElementsByClassName('view-canvas')){
        let ctx = canvas.getContext('2d');
        ctx.translate(dx, dy);
        constrain_view(ctx, 1, dx, dy);
    }
    update_views();
}

function constrain_view(ctx, scale, dx, dy){
    let transforms = ctx.getTransform();

    if (transforms.a*scale < ctx.canvas.width / vars.image_shape[0]){
        // We don't want to allow any zooming outside of the image area and reset
        // it to the default view

        transforms.a = ctx.canvas.width / vars.image_shape[0];
        transforms.d = ctx.canvas.width / vars.image_shape[0];
        transforms.b = 0;
        transforms.c = 0;
        transforms.e = 0;
        transforms.f = 0;
    }

    let top_left = ctx.getCanvasCoords(0, 0);
    if (top_left.x > 0){
        transforms.e -= top_left.x;
    }
    if (top_left.y > 0){
        transforms.f -= top_left.y;
    }

    let bottom_right = ctx.getCanvasCoords(...vars.image_shape);
    if (bottom_right.x < ctx.canvas.width){
        transforms.e -= bottom_right.x - ctx.canvas.width;
    }
    if (bottom_right.y < ctx.canvas.height){
        transforms.f -= bottom_right.y - ctx.canvas.height;
    }

    ctx.setTransform(
        transforms.a, transforms.b, transforms.c,
        transforms.d, transforms.e, transforms.f
    );
}

function update_views(){
    /*Update all views in all canvases. Always required after a zooming or
    translation action.*/

    // The coordinate system has changed:
    let image_coords = get_ctx('canvas-0-image').getWorldCoords(
        ...vars.cursor_canvas
    );
    vars.cursor_image = [image_coords.x, image_coords.y];

    // Redraw everything:
    render_images();
    render_mask();
    render_preview();
}

function reset_views(){
    for (var i=0; i < vars.views.length; i++){
        if (!view_is_image(vars.views[i])){
            set_view_iframe(i);
        }
    }

    for (let canvas of document.getElementsByClassName('view-canvas')){
        let ctx = canvas.getContext('2d');
        ctx.setTransform(
            ctx.canvas.width / vars.image_shape[0], 0, 0,
            ctx.canvas.width / vars.image_shape[0], 0, 0
        );
    }

    update_views();
}

function update_cursor_coords(obj, event){
    // Update the current coords to image coordinate system:
    let rect = obj.getBoundingClientRect();
    let x = round_number(
        (event.clientX - rect.left) / (rect.right - rect.left) * obj.width
    );
    let y = round_number(
        (event.clientY - rect.top) / (rect.bottom - rect.top) * obj.height
    );

    vars.cursor_canvas = [x, y];
    let image_coords = get_ctx('canvas-0-image').getWorldCoords(x, y);
    vars.cursor_image = [
        round_number(image_coords.x), round_number(image_coords.y)
    ];
}

function update_drawn_pixels(){
    vars.n_user_pixels = {
        "total": 0
    };
    for (var i=0; i < vars.classes.length; i++){
        vars.n_user_pixels[i] = 0;
    }

    for (var i=0; i<vars.user_mask.length; i++){
        if (vars.user_mask[i]){
            vars.n_user_pixels[vars.mask[i]] += 1;
            vars.n_user_pixels.total += 1;
        }
    }
    get_object("drawn-pixels").innerHTML = nice_number(vars.n_user_pixels.total);

    var different_classes = 0;
    for (var i=0; i < vars.classes.length; i++){
        if (vars.n_user_pixels[i] > 10){
            different_classes += 1;
        }
    }

    get_object("different-classes").innerHTML = different_classes;

    if (different_classes >= 2){
        get_object("ai-recommendation").innerHTML = "Start the training!";
    } else {
        get_object("ai-recommendation").innerHTML = "Draw at least 10 pixels from two classes!";
    }
}

function discard_future(){
    // Delete everything ahead the current epoch in the history stack
    if (vars.history.current_epoch == vars.history.mask.length-1){
        return;
    }

    var start = vars.history.current_epoch+1;
    var n_elements = vars.history.mask.length - vars.history.current_epoch
    vars.history.mask.splice(start, n_elements);
    vars.history.user_mask.splice(start, n_elements);
}

function update_history(){
    vars.history.mask.push(vars.mask.slice());
    vars.history.user_mask.push(vars.user_mask.slice());

    if (vars.history.mask.length > vars.history.max_epochs){
        // Remove the oldest timestamp
        vars.history.mask.shift();
        vars.history.user_mask.shift();
    }
    vars.history.current_epoch = vars.history.mask.length - 1;
}

function undo(){
    if (vars.history.mask.length == 0){
        // There is no history saved
        return;
    }

    vars.history.current_epoch -= 1;
    vars.history.current_epoch = Math.max(
        vars.history.current_epoch, 0
    );

    vars.mask = vars.history.mask[vars.history.current_epoch].slice();
    vars.user_mask = vars.history.user_mask[vars.history.current_epoch].slice();

    update_drawn_pixels();
    reload_hidden_mask();
    render_mask();
}

function redo(){
    if (vars.history.mask.length == 0){
        // There is no history saved
        return;
    }

    vars.history.current_epoch += 1;
    vars.history.current_epoch = Math.min(
        vars.history.current_epoch, vars.history.mask.length-1
    );

    vars.mask = vars.history.mask[vars.history.current_epoch].slice();
    vars.user_mask = vars.history.user_mask[vars.history.current_epoch].slice();

    update_drawn_pixels();
    reload_hidden_mask();
    render_mask();
}

function user_draws_on_mask(){
    /*The user draws to the mask

    Returns:
        * list([x0, y0, xn, yn]) - bounding_box in canvas coordinates

    */
    let canvas = get_object('canvas-0-image');
    let ctx = canvas.getContext('2d');

    // Get the area we finally have to render (update) in canvas coordinates.
    // This increases the performances:
    let drawing_area = {
        'min_x': vars.image_shape[0],
        'min_y': vars.image_shape[1],
        'max_x': 0,
        'max_y': 0,
    };

    // Since the tools (like the painting brush) are centered on the cursor, all
    // tool pixels must be translated by an offset:
    let offset = get_tool_offset();

    // We go through each tool pixel (pixel where something should be drawn to)
    // and check whether it is inside the mask and canvas area. Hence, we need
    // to convert the tool pixels which are relative coordinates into mask and
    // canvas coordinates.

    // Get the bounding box mask coordinates:
    let x_start = vars.cursor_image[0] + offset.x,// - vars.mask_area[0],
        x_end = x_start + vars.tool.size;
    let y_start = vars.cursor_image[1] + offset.y,// - vars.mask_area[1],
        y_end = y_start + vars.tool.size;

    // Make sure we do not draw outside of the canvas. Hence, here we have the
    // canvas boundaries in image coordinates:
    let canvas_bounds = [
        ctx.getWorldCoords(0, 0),
        ctx.getWorldCoords(canvas.width, canvas.height)
    ];
    x_start = Math.max(round_number(canvas_bounds[0].x), x_start);
    x_end = Math.min(round_number(canvas_bounds[1].x), x_end);
    y_start = Math.max(round_number(canvas_bounds[0].y), y_start);
    y_end = Math.min(round_number(canvas_bounds[1].y), y_end);

    // Transform into mask coordinates:
    x_start -= vars.mask_area[0];
    x_end -= vars.mask_area[0];
    y_start -= vars.mask_area[1];
    y_end -= vars.mask_area[1];

    // Make sure we do not draw outside of the masking area:
    x_start = Math.max(0, x_start);
    x_end = Math.min(vars.mask_shape[0]-1, x_end);
    y_start = Math.max(0, y_start);
    y_end = Math.min(vars.mask_shape[1]-1, y_end);

    for (let x = x_start; x < x_end; x++) {
        for (let y = y_start; y < y_end; y++) {
            if (vars.tool.type == "eraser"){
                vars.user_mask[y*vars.mask_shape[0]+x] = 0;
            } else {
                vars.mask[y*vars.mask_shape[0]+x] = vars.current_class;
                vars.user_mask[y*vars.mask_shape[0]+x] = 1;
            }
        }
    }
    drawing_area = [x_start, y_start, x_end-x_start, y_end-y_start];

    // Now we draw on the hidden mask and render it
    if (vars.mask_type == 'final' || vars.mask_type == 'user'){
        var hidden_ctx = vars.hidden_mask.getContext('2d');
        hidden_ctx.clearRect(...drawing_area);

        if (vars.tool.type != "eraser"){
            hidden_ctx.fillStyle = rgba2css(get_current_class_colour());
            hidden_ctx.fillRect(...drawing_area);
        }

        // Render the current mask view:
        render_mask(drawing_area);
    }

    update_drawn_pixels();

    // Part of the history (undo-redo) system. When new pixels are drawn, we
    // delete all saved future elements in the history stack and add the
    // current masks to the history
    discard_future();
    update_history();
}

function reload_hidden_mask(){
    /*Update hidden mask on a offscreen canvas*/
    let ctx = vars.hidden_mask.getContext('2d');

    // Prepare the actual mask which will be drawn:
    let [mask, colours] = get_current_mask_and_colours();
    let sprite = ctx.createImageData(...vars.mask_shape);

    // We go through each pixel in the bounding box and redraw them:
    for (var y = 0; y < sprite.height; y++) {
        for (var x = 0; x < sprite.width; x++) {
            var offset = (y * sprite.width + x) * 4;
            let colour = colours[mask[y*vars.mask_shape[0]+x]];
            sprite.data[offset] = colour[0];
            sprite.data[offset + 1] = colour[1];
            sprite.data[offset + 2] = colour[2];
            sprite.data[offset + 3] = colour[3];
        }
    }

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    //(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight):
    ctx.putImageData(sprite, 0, 0);
}

function set_mask_type(type){
    get_object("tb_mask_"+vars.mask_type).classList.remove("checked");
    get_object("tb_mask_"+type).classList.add("checked");

    vars.mask_type = type;

    reload_hidden_mask();
    render_mask();
    show_mask(true);
}

function get_current_class_colour(){
    if (vars.mask_type == "user"){
        if ("user_colour" in vars.classes[vars.current_class]){
            return vars.classes[vars.current_class].user_colour;
        } else {
            return vars.classes[vars.current_class].colour;
        }
    } else { //  if (vars.mask_type == "user"){
        return vars.classes[vars.current_class].colour;
    }
}

function get_current_mask_and_colours(){
    if (vars.mask_type == "final"){
        var colours = [];
        for (var c of vars.classes){
            colours.push(c.colour);
        }
        return [vars.mask, colours]
    } else if (vars.mask_type == "user"){
        var colours = [
            [255, 255, 255,0], // no user pixel
        ];
        for (var c of vars.classes){
            if ("user_colour" in c){
                colours.push(c.user_colour);
            } else {
                colours.push(c.colour);
            }
        }
        var mask = new Uint8Array(vars.mask.length);
        for (var i=0; i<mask.length; i++){
            if (vars.user_mask[i]){
                mask[i] = vars.mask[i] + 1;
            } else {
                // User did not draw anything, so keep it transparent:
                mask[i] = 0;
            }
        }

        return [mask, colours]
    } else if (vars.mask_type == "errors"){ // error mask
        var colours = [
            [255, 255, 255,0], // no validation possible
            [0, 255, 0, 70], // correctly predicted
            [255, 70, 70, 255], // wrongly predicted
        ];
        return [vars.errors_mask, colours]
    }
}

function render_mask(bbox=null){
    /*Draw the mask onto the mask canvases.

    Args:
        bbox [x_0, y_0, x_n, y_n]: area in canvas coordinates that should
        be rendered. If given, this function only redraws this area.
        Otherwise (per default), it renders the whole mask in the current canvas
        area again.
    */

    // Render the new mask sprite to all canvases:
    for (var i=0; i < vars.views.length; i++) {
        if (!view_is_image(vars.views[i])){
            continue;
        }

        var ctx = get_ctx("canvas-"+i+"-mask");
        if (bbox === null){
            // No specific coordinates are given, i.e. we redraw the whole mask:
            ctx.clearRect(0, 0, ...vars.image_shape);
            ctx.drawImage(
                vars.hidden_mask,
                vars.mask_area[0], vars.mask_area[1]
            );
        } else {
            ctx.clearRect(
                bbox[0]+vars.mask_area[0],
                bbox[1]+vars.mask_area[1],
                bbox[2], bbox[3]
            );
            //(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight):
            ctx.drawImage(
                vars.hidden_mask,
                ...bbox,
                bbox[0]+vars.mask_area[0], bbox[1]+vars.mask_area[1],
                bbox[2], bbox[3]
            );
        }
    }
}

function render_preview(){
    let offset = get_tool_offset();

    for (var i=0; i < vars.views.length; i++) {
        if (!view_is_image(vars.views[i])){
            continue;
        }

        var ctx = get_ctx("canvas-"+i+"-preview");
        ctx.clearRect(0, 0, ...vars.image_shape);
        ctx.fillStyle = "rgba(150, 150, 150, 0.5)";
        ctx.fillRect(
            vars.cursor_image[0]+offset.x,
            vars.cursor_image[1]+offset.y,
            vars.tool.size, vars.tool.size
        );

        // Draw the boundaries of the masking area
        ctx.beginPath();
        if (vars.views.length < 2){
            ctx.lineWidth = "3";
        } else {
            ctx.lineWidth = "2";
        }

        ctx.strokeStyle = "red";
        ctx.setLineDash([5, 15]);
        ctx.rect(
            vars.mask_area[0], vars.mask_area[1],
            ...vars.mask_shape
        );
        ctx.stroke();
    }
}

function view_is_image(view){
    return view.type == "rgb"
}

function render_image(view_number){
    if (!view_is_image(vars.views[view_number])){
        return;
    }

    let image = vars.images[view_number];
    let canvas_id = "canvas-" + view_number;
    let canvas = get_object(canvas_id+"-image");
    let ctx = canvas.getContext('2d');

    // Apply brightness, contrast and saturation filters:
    let filters = [];
    if (vars.invert){
        filters.push("invert(1)");
    }
    filters.push("brightness("+vars.brightness+"%)");
    if (vars.contrast){
        filters.push("contrast(200%)");
    }
    filters.push("saturate("+vars.saturation+"%)");
    canvas.style.filter = filters.join(" ");

    let transform = ctx.getTransform();

    ctx.drawImage(
        image, 0, 0, ...vars.image_shape
    );
}

function dialogue_reset_mask(){
    var content = "<p>Are you sure you want to reset all your drawn pixels?</p>";
    content += "<button onclick='hide_dialogue();reset_mask();'>Reset</button>";
    content += "<button onclick='hide_dialogue();'>Cancel</button>";
    show_dialogue("warning", content);
}

function reset_mask(){
    vars.mask = new Uint8Array(vars.mask_shape[1]*vars.mask_shape[0]);
    vars.user_mask = new Uint8Array(vars.mask_shape[1]*vars.mask_shape[0]);

    vars.mask.fill(0);
    vars.user_mask.fill(0);

    reload_hidden_mask();
    render_mask();
    update_drawn_pixels();
}

function reset_filters(){
    vars.brightness = 100;
    vars.saturation = 100;
    set_contrast(false);
    set_invert(false);
    render_images();
}

function show_mask(visible){
    vars.show_mask = visible;
    var state = "none";
    if (vars.show_mask){
        state = "block";
    }
    for (var i=0; i < vars.views.length; i++){
        if (!view_is_image(vars.views[i])){
            continue;
        }
        get_object("canvas-"+i+"-mask").style.display = state;
    }

    if (vars.show_mask){
        get_object("tb_toogle_mask").classList.add("checked");
    } else {
        get_object("tb_toogle_mask").classList.remove("checked");
    }
}

async function dialogue_image(){
    if (!vars.thumbnail_available && !vars.metadata_available){
        show_dialogue(
            "info",
            "No further image information available.",
            false, "image: "+vars.image_id
        );
        return;
    }
    let content = '';
    if (vars.thumbnail_available){
        content += '<p><img src="'+vars.url.main+'thumbnail/'+vars.image_id+'"  style="display: block; margin-left: auto; margin-right: auto;"/></p>';
    }

    if (vars.metadata_available){
        let response = await fetch(
            vars.url.main+'metadata/'+vars.image_id+'?safe_html=True'
        );

        if (response.status >= 400){
            content += await response.text();
        } else {
            let metadata = await response.json();
            content += '<table>';
            content += '<tr><td><b>Attribute</b></td><td><b>Value</b></td></tr>';

            // row and col are at the same the id for the row and column class, respectively
            for (const attribute in metadata){
                content += '<tr>';
                content += '<td>'+attribute+'</td>';

                if (attribute == "location"){
                    let location = metadata[attribute]
                                    .replace('[', '')
                                    .replace(']', '')
                                    .replace(' ', '')

                    content += '<td>' + metadata[attribute];
                    content += ' <a target="_blank" href="https://www.google.com/maps/search/?api=1&query='+location+'">Show on map</a></td>';
                } else {
                    content += '<td>'+metadata[attribute]+'</td>';
                }

                content += '</tr>';
            }
            content += '</table>';
        }
    } else {
        content += 'No metadata information available!';
    }

    show_dialogue(
        "info", content, false, "image: "+vars.image_id
    );
}

function dialogue_confusion_matrix(){
    if (vars.confusion_matrix === null){
        show_dialogue(
            "info",
            "You need to train the AI first before you can see a confusion matrix",
            false, "Confusion Matrix"
        );
        return;
    }

    let content = '<table class="confusion-matrix" style="float: left;">';
    content += '<tr class="first"><td class="upper-left">Real / Prediction</td>';

    for (let col_class of vars.classes){
        content += '<td class="first">'+col_class.name+'</td>';
    }

    content += '</tr>';

    // row and col are at the same the id for the row and column class, respectively
    for (var row=0; row<vars.classes.length; row++){
        content += '<tr>';
        content += '<td class="first">'+vars.classes[row].name+'</td>';
        for (var col=0; col<vars.classes.length; col++){
            content += '<td>'+nice_number(vars.confusion_matrix[row][col])+'</td>';
        }
        content += '</tr>';
    }
    content += '</table>';

    show_dialogue("info", content, false, "Confusion Matrix");
}

function dialogue_class_selection(){
    var content = "<p>Here is an overview about all classes:</p>";
    content += "<table>";
    content += "<th><td>Drawn pixels by user</td><td>Description</td></th>";

    for (var i=0; i<vars.classes.length; i++){
        var c = vars.classes[i]
        content += "<tr>";
        content += "<td><button style='background-color: "+rgba2css(c.colour)+"; width: 100%;' ";
        content += "onclick='set_current_class("+i+"); hide_dialogue();'>";
        content += c.name+"</button></td>";
        content += "<td style='text-align: center;'>"+vars.n_user_pixels[i]+"</td>";
        content += "<td>"+c.description+"</td>";
        content += "</tr>";
    }

    content += "</table>";

    show_dialogue("info", content, false, "Class selection");
}

async function dialogue_help(){
    let hotkeys = {};

    for (command of Object.values(commands)){
        if ("key" in command){
            hotkeys[command.key] = command.description;
        }
    }
    let response = await fetch(
        vars.url.help, {
            method: "POST",
            body: JSON.stringify({
                "hotkeys": hotkeys,
                "page": "Segmentation",
                "page_content": "segmentation/help.html"
            })
        }
    );
    let content = await response.text();
    show_dialogue("info", content, false, title="Help");
}

async function load_mask(){
    show_loader("Loading masks...");

    var results = await download(
        vars.url.segmentation+"load_mask/" + vars.image_id
    );

    if (results.response.status != 200 && results.response.status != 404) {
        hide_loader();

        let error = await results.response.text();
        show_dialogue(
            "error",
            "Could not load the mask from the server!\n" + error
        );
        return;
    }

    var mask_length = vars.mask_shape[1]*vars.mask_shape[0];
    vars.mask = new Uint8Array(mask_length);
    vars.user_mask = new Uint8Array(mask_length);
    vars.errors_mask = new Uint8Array(mask_length);
    vars.errors_mask.fill(0);

    if (results.response.status == 200){
        var data = results.data;
        vars.mask = data.slice(1, mask_length+1);
        vars.user_mask = data.slice(mask_length+1, 2*mask_length+1);
    } else if (results.response.status == 404) {
        // Just use the default mask
        vars.mask.fill(0);
        vars.user_mask.fill(0);
    }

    set_mask_type(vars.mask_type);
    hide_loader();
    update_drawn_pixels();

    // Part of the history (undo-redo) system. When new pixels are drawn, we
    // delete all saved future elements in the history stack and add the
    // current masks to the history
    discard_future();
    update_history();
}

async function download(url, init=null, html_object=null){
    if (init === null){
        var response = await fetch(url);
    } else {
        var response = await fetch(url, init);
    }

    if (response.status >= 400){
        if (response.status == 403) {
            dialogue_login();
        }
        return {
            "response": response,
            "data": null
        };
    }

    let header = response.headers.get("content-type");
    let data;
    if (header == "application/octet-stream"){
        const reader = response.body.getReader();
        let result = await reader.read();
        let received_bytes = 0;
        let chunks = [];

        while (!result.done) {
            const value = result.value;

            received_bytes += value.length;
            chunks.push(value);

            // get the next result
            result = await reader.read();
        }

        data = new Uint8Array(received_bytes);
        let position = 0;
        for(let chunk of chunks) {
          data.set(chunk, position); // (4.2)
          position += chunk.length;
        }
    } else {
        data = await response.json();
    }

    return {
        "response": response,
        "data": data
    };
}

function activate_mask(){
    /*If the user thinks this mask is not yet good enough*/

}

function deactivate_mask(){
    /*If the user thinks this mask is not yet good enough*/

}

function save_mask(call_afterwards=null){
    // Do not save any masks if they have not been loaded yet
    let abort_save = false;
    if (vars.mask === null
        || vars.user_mask === null
        || vars.n_user_pixels.total == 0
    ){
        if(call_afterwards !== null){
          call_afterwards();
        }
        return;
    }

    // Combine both masks together to one byte array only with padding magic
    // numbers 254 to make sure the transaction was done successfully
    var m_length = vars.mask_shape[0]*vars.mask_shape[1];
    var data = new Uint8Array(2*m_length+2);
    var padding = new Uint8Array([254]);
    data.set(padding);
    data.set(vars.mask, 1);
    data.set(vars.user_mask, m_length+1);
    data.set(padding, 2*m_length+1);

    fetch(vars.url.segmentation+"save_mask/" + vars.image_id, {
        method: "POST",
        body: data,
        headers: {
            "Content-Type": "application/octet-stream"
        }
    }).then(
        function(response) {
            save_mask_finished(response, call_afterwards);
        }
    );
}

async function save_mask_finished(response, call_afterwards){
    fetch_server_update();

    if (response.status === 200) {
        show_message('Mask saved', 1000);
        if(call_afterwards !== null){
          call_afterwards();
        }
    } else {
        let error = await response.text();
        show_dialogue(
            "error",
            "<p>Could not save the mask due to an internal problem!</p>" + error
        )
    }
}

async function predict_mask(){
    var user_classes = [];
    for (var i=0; i < vars.classes.length; i++){
        if (vars.n_user_pixels[i] > 10){
            user_classes.push(i);
        }
    }
    if (user_classes.length < 2){
        // This means there is only one class with enough training pixels:
        show_dialogue(
            "warning", "You need to draw at least 10 pixels for more than one class to use the AI."
        );
        return;
    }

    show_loader("Prepare training data...");

    // Get all the user pixels
    let all_user_pixels = new Array();
    let all_user_labels = new Array();
    for (var i=0; i<=vars.user_mask.length; i++){
        // Only add the user pixel if there are enough pixels from that class:
        if (vars.user_mask[i] && vars.n_user_pixels[vars.mask[i]] > 10){
            all_user_pixels.push(i);
            all_user_labels.push(vars.mask[i]);
        }
    }

    // Sample training points (we do not want to train the model on all points):
    let all_indices = Array(all_user_pixels.length).fill().map((_, i) => i);
    var rng = new RNG(42);
    rng.shuffle(all_indices);

    // We need to keep track of how many pixels we already have sampled.
    // Furthermore, we keep also a ratio of pixels as testing dataset:
    let n_samples = {};
    for (let user_class of user_classes){
        // Set the current number of samples (0) and the maximum
        n_samples[user_class] = {
            "current": 0,
            "max": Math.min(
                round_number(vars.n_user_pixels[user_class]*vars.config.segmentation.train_ratio),
                vars.config.segmentation.max_train_pixels
            )
        };
    }

    // Here we decide whether we send a pixel for training to the server or keep
    // it here as testing dataset:
    let test_indices = new Array();
    let train_user_pixels = new Array();
    let train_user_labels = new Array();
    for (let i of all_indices){
        let class_id = all_user_labels[i];
        if (n_samples[class_id].current < n_samples[class_id].max){
            train_user_pixels.push(all_user_pixels[i]);
            train_user_labels.push(class_id);
            n_samples[class_id].current += 1;
        } else {
            // We will remember that we need these pixels later for testing:
            test_indices.push(i);
        }
    }

    show_loader("Train AI...");
    let results = await download(
            vars.url.segmentation+"predict_mask/" + vars.image_id,
            {
                method: "POST",
                body: JSON.stringify({
                    "user_pixels": train_user_pixels,
                    "user_labels": train_user_labels,
                })
            }
        );

    show_loader("Process results...");
    if (results.response.status >= 500) {
        hide_loader();
        console.log("Could not predict the mask! Code: " + results.response.status);
        show_dialogue(
            "error",
            "<p>Could not predict the mask due to a server problem!</p>"
        )
        return;
    }

    // Calculate confusion matrix and harmonic mean of accuracies:
    let cm = createArray(vars.classes.length, vars.classes.length);
    fill2DArray(cm, 0);

    vars.errors_mask = new Uint8Array(vars.mask.length);
    vars.errors_mask.fill(0);

    let tp = {};
    for (let user_class of user_classes){
        tp[user_class] = 0;
    }
    for (let i of all_indices){
        let mask_index = all_user_pixels[i];
        cm[all_user_labels[i]][results.data[mask_index]] += 1;

        if (all_user_labels[i] == results.data[mask_index]){
            tp[all_user_labels[i]] += 1;

            // Correct:
            // vars.errors_mask[mask_index] = 1;
        } else {
            // Incorrect:
            vars.errors_mask[mask_index] = 2;
        }
    }
    let acc_prod = user_classes.length;
    let acc_sum = 0;
    for (let label of user_classes){
        let acc = tp[label] / (vars.n_user_pixels[label]);
        acc_prod *= acc;
        acc_sum += acc;
    }

    // Set the confusion matrix
    vars.confusion_matrix = cm;

    update_ai_box(acc_prod / acc_sum, cm, tp, user_classes);

    for (var i = 0; i < results.data.length; i++) {
        // Only update the mask where the user did not draw to.
        if (!vars.user_mask[i]){
            vars.mask[i] = results.data[i];
        }
    }
    reload_hidden_mask();
    render_mask();

    // Part of the history (undo-redo) system. When new pixels are drawn, we
    // delete all saved future elements in the history stack and add the
    // current masks to the history
    discard_future();
    update_history();

    hide_loader();
}



function update_ai_box(score, cm, tp, user_classes){
    get_object("ai-score").innerHTML = round_number(score*100) + "%";

    let recommendation = "Draw more training pixels!";

    let min_acc = 1;
    let worst_label = null;

    for (let label of user_classes){
        let acc = tp[label] / (vars.n_user_pixels[label]);
        if (acc < min_acc){
            min_acc = acc;
            worst_label = label;
        }
    }
    if (worst_label !== null){
        recommendation = "Could you provide more training pixels for <b>"+vars.classes[worst_label].name+"</b>?";
    }

    get_object("ai-recommendation").innerHTML = recommendation;
}

function render_images(){
    for (var i=0; i < vars.views.length; i++){
        render_image(i);
    }
}
