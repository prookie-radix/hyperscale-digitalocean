# DISCLAIMER

This script is provided "as is" without any warranties or guarantees of any kind. 
By using this script, you acknowledge that you are solely responsible for any consequences, 
damages, or issues that may arise from its usage.

The author(s) of this script assume no responsibility or liability for any loss of data, 
system failure, downtime, security breaches, or other consequences that may result 
from running this script. Use this script at your own risk.

You should thoroughly test this script in a safe, non-production environment before using it in any live systems.

Make sure to regularly check your Digitalocean account for droplets that you do not want to run anymore
to avoid unexpected costs.

# DigitalOcean API token
Provide your API token by creating the file `do-key.txt` and placing the token in it.

The token needs accesst to some scopes, which still need to be documented here. "Full access" will work for sure.

# Install

```
npm install
```

# Usage example

See [usage-example.txt](usage-example.txt).

# Available commands

## create
Creates one or more droplets and passes a cloud-init script to them which will download and spawn a Radix Hyperscale node automatically.
The tag `radix-hyperscale` will be assigned to these droplets, such that the other commands can operate on this subset of droplets in your account.
Also all available SSH keys in your account will be assigned to the droplets.

It downloads the Hyperscale Jar- and Config-Files from one of my servers. So when there are new files, I need to upload/update them first before you can spawn nodes of the new software version.

A few minutes after creation you can access the dashboard of the node via `http://[DROPLET_IP]:8080/dashboard/index.html`.
```
node hyperscale-do-api.js create [count] [region] [size]
```
Parameters:
- `count`: optional, default value `1` (creates a single node, increase to create multiple instances)
- `region`: optional, default value `fra` (specifies datacenter)
- `size`: optional, default value `c-8` (specifies droplet size)

## list
Displays a table containing details for every droplet having the tag `radix-hyperscale` in your account.
```
node hyperscale-do-api.js list
```

## list-dashboards
Displays a simple list of Hyperscale dashboard URLs for every droplet having the tag `radix-hyperscale` in your account.
```
node hyperscale-do-api.js list-dashboards
```

## list-loads
Connets to all droplet having the tag `radix-hyperscale` in your account via SSH and prints the output of `uptime` (including the load values).
```
node hyperscale-do-api.js list-loads [sshkey-file-path]
```
Parameters:
- `sshkey-file-path`: specify the path to the SSH private key file of the public key you uploaded to your DigitalOcean account and therefore grants you access to the droplets.

## price
Displays the total hourly and monthly cost for every droplet having the tag `radix-hyperscale` in your account.
```
node hyperscale-do-api.js price
```

## delete
Deletes every droplet having the tag `radix-hyperscale` in your account.
```
node hyperscale-do-api.js delete
```
