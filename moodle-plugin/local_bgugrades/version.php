<?php
// Lee la ESTRUCTURA del libro de calificaciones de un aula: qué ítems tiene,
// cuánto pesa cada uno y con qué método se agregan. Sin pasar por ningún
// estudiante, para que un aula recién construida y todavía vacía se pueda
// auditar el día que se termina.

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_bgugrades';
$plugin->version   = 2026081200;
$plugin->requires  = 2022041900;   // Moodle 4.0
$plugin->maturity  = MATURITY_STABLE;
$plugin->release   = '1.0.0';
