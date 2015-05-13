#!/usr/bin/python
#
# Narcissus 'shell' for use with jstests.py
# Expects to be in the same directory as ./js
# Expects the Narcissus src files to be in ./narcissus/

import os, re, sys, signal
from subprocess import *
from optparse import OptionParser

THIS_DIR = os.path.dirname(__file__)
SPIDERMONKEY_DIR = os.path.abspath(os.path.join(THIS_DIR, 'spidermonkey'))

if 'NJS_SHELL' in os.environ:
    js_cmd = os.path.abspath(os.environ['NJS_SHELL'])
else:
    js_cmd = os.path.abspath(os.path.join(THIS_DIR, 'js'))

if 'NARC_SHELL' in os.environ:
    narc_shell = os.path.abspath(os.environ['NARC_SHELL'])
else:
    narc_shell = os.path.join(SPIDERMONKEY_DIR, "shell-raw.js")

def handler(signum, frame):
    print ''
    # the exit code produced by ./js on SIGINT
    sys.exit(130)

signal.signal(signal.SIGINT, handler)

if __name__ == '__main__':
    op = OptionParser(usage='%prog [TEST-SPECS]')
    op.add_option('-f', '--file', dest='js_files', action='append',
            help='JS file to load', metavar='FILE')
    op.add_option('-e', '--expression', dest='js_exps', action='append',
            help='JS expression to evaluate')
    op.add_option('-i', '--interactive', dest='js_interactive', action='store_true',
            help='enable interactive shell')
    op.add_option('-I', '--interactive-meta', dest='js_interactive_meta', action='store_true',
            help='load Narcissus but run interactive SpiderMonkey shell')
    op.add_option('-E', '--expression-meta', dest='js_exps_meta', action='append',
            help='expression to evaluate with SpiderMonkey after loading Narcissus')
    op.add_option('-P', '--parse-only', dest='js_parseonly', action='store_true',
            help='stop after the parsing stage and output pretty-printed source code')
    op.add_option('-w', '--web-compatible', dest='js_webcompatible', action='store_true',
            help='disable non-standard Mozilla extensions')
    op.add_option('-p', '--paren-free', dest='js_parenfree', action='store_true',
            help='use experimental paren-free syntax')
    op.add_option('-d', '--desugar', dest='js_desugar', action='store_true',
            help='desugar SpiderMonkey language extensions')

    (options, args) = op.parse_args()

    cmd = ""

    # if options.js_webcompatible:
    #     cmd += 'Narcissus.options.mozillaMode = false; '

    # if options.js_parenfree:
    #     cmd += 'Narcissus.options.parenFreeMode = true; '

    # if options.js_desugar:
    #     cmd += 'Narcissus.options.desugarExtensions = true; '

    if options.js_exps:
        for exp in options.js_exps:
            if options.js_parseonly:
                cmd += 'print(Narcissus.decompiler.pp(Narcissus.parser.parse("%s"))); ' % exp.replace('"', '\\"')
            else:
                cmd += 'Narcissus.interpreter.evaluate("%s"); ' % exp.replace('"', '\\"')

    if options.js_files:
        for file in options.js_files:
            if options.js_parseonly:
                cmd += 'print(Narcissus.parser.parse(snarf("%(file)s"), "%(file)s", 1)); ' % { 'file':file }
            else:
                cmd += 'Narcissus.interpreter.test(function(){Narcissus.interpreter.evaluate(snarf("%(file)s"), "%(file)s", 1);}) || quit(1);' % { 'file':file }

    if (not options.js_exps) and (not options.js_files):
        options.js_interactive = True

    argv = [js_cmd, '-f', narc_shell]

    if options.js_exps_meta:
        argv += ['-e', cmd]
        for exp in options.js_exps_meta:
            argv += ['-e', exp]
        if options.js_interactive_meta:
            argv += ['-i']
    elif options.js_interactive_meta:
        argv += ['-e', cmd, '-i']
    else:
        if options.js_interactive:
            cmd += 'Narcissus.interpreter.repl();'
            argv = ['rlwrap'] + argv
        argv += ['-e', cmd]

    try:
        retcode = Popen(argv).wait()
    except OSError as e:
        if e.errno is 2 and options.js_interactive:
            retcode = Popen(argv[1:]).wait()

    exit(retcode)