#!/usr/bin/env bash
echo '{ 
    "appsRepoUrl": "https://gitlab.com/dspworks-public/sm-app-store.git"
}' > state/settings.json
npm i -g pnpm
pnpm i
sudo apt-get update
sudo apt-get install jq fswatch -y
mkdir logs
mkdir data
sudo chown node logs
sudo chown node data 
