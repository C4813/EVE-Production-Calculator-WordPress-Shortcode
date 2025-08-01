<?php
/*
Plugin Name: EVE Production Calculator
Description: Adds a shortcode [eve_production_calculator] which allows users to see the build requirements for any blueprint in EVE Online.
Version: 0.3.14
Author: C4813
*/

defined('ABSPATH') or die('No script kiddies please!');

function eve_production_calculator_assets() {
    $plugin_url = plugin_dir_url(__FILE__);

    // Enqueue styles
    wp_enqueue_style('eve-production-calculator-style', $plugin_url . 'style.css');

    // Enqueue JS script from includes/js/
    wp_enqueue_script(
        'eve-production-logic',
        $plugin_url . 'includes/js/production-logic.js',
        [],
        false,
        true
    );

    // Pass JSON URLs to JS - all in data/ folder at plugin root
    wp_localize_script('eve-production-logic', 'productionCalculatorVars', [
        'materialsUrl' => $plugin_url . 'includes/data/industryActivityMaterials.json',
        'nameidUrl' => $plugin_url . 'includes/data/invTypes.json',
        'marketGroupsUrl' => $plugin_url . 'includes/data/marketGroups.json'
    ]);
}
add_action('wp_enqueue_scripts', 'eve_production_calculator_assets');

function eve_production_calculator_shortcode() {
    ob_start();
    include plugin_dir_path(__FILE__) . 'includes/production-ui.php';
    return ob_get_clean();
}
add_shortcode('eve_production_calculator', 'eve_production_calculator_shortcode');
