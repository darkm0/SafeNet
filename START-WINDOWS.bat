@echo off
title SafeNet Online Safety
cd /d "%~dp0backend"
call npm.cmd install
call npm.cmd start
pause
