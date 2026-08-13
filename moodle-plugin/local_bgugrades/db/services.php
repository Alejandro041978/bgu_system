<?php
// Declaración de la función de webservice.
//
// `type => read` es literal: la función no escribe nada en Moodle. Y no se
// declara `ajax`, porque no la llama el navegador: la llama el ERP con su token.

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_bgugrades_get_grade_structure' => [
        'classname'    => 'local_bgugrades_external',
        'methodname'   => 'get_grade_structure',
        'classpath'    => 'local/bgugrades/externallib.php',
        'description'  => 'Estructura del libro de calificaciones de una o varias aulas: ítems, ponderaciones y método de agregación. No devuelve calificaciones de nadie.',
        'type'         => 'read',
        'capabilities' => 'moodle/grade:viewall',
    ],
];
