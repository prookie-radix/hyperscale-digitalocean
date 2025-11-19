/*
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
*/


const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const {exec} = require('child_process');
const readline = require('readline');
const {createApiClient} = require('dots-wrapper');

const dropletTag = 'radix-hyperscale';

if (!fs.existsSync('./do-key.txt')) {
  console.error('Error: DigitalOcean API token missing, please create a file "do-key.txt" containing your api token.');
  process.exit(1);
}

const doApiToken = fs.readFileSync('./do-key.txt', 'utf8').trim();

if (!doApiToken) {
  console.error('Error: No API token present in file "do-key.txt"');
  process.exit(1);
}

const action = process.argv[2];

if (!action) {
  console.log('No action parameter given');
  process.exit(1);
}

const dots = createApiClient({token: doApiToken});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const main = async () => {
  /*
  const {data: {account}} = await dots.account.getAccount();
  console.log(account);
  */

  switch (action) {
    case 'create':
      await actionCreate();
      break;

    case 'list':
      await actionList();
      break;

    case 'list-dashboards':
      await actionListDashboards();
      break;

    case 'list-stats':
      await actionListStats();
      break;

    case 'list-loads':
      await actionListLoads();
      break;

    case 'price':
      await actionPrice();
      break;

    case 'delete':
      await actionDelete();
      break;

    default:
      console.error(`Unknown command supplied: "${action}"`);
      break;
  }
  
};

main();

rl.close();


async function actionCreate() {
  try {
    const count = parseInt(process.argv?.[3] ?? 1);
    const region = process.argv?.[4] ?? 'fra';
    const size = process.argv?.[5] ?? 'c-8';

    if (count < 1 || count > 50) {
      console.error(`You requested to create ${count} droplets, aborting (requirement: 1 <= count <= 50)`);
      process.exit(1);
    }

    const names = Array.from({length: count}, (_, index) => 'radix-hyperscale-'+generateRandomHex(16));

    console.log('Loading your SSH key fingerprints...');
    const availableSshKeyFingerprints = (await getSshKeys()).map(key => key.fingerprint);

    const input = {
      names,
      region,
      size,
      image: "ubuntu-24-10-x64", // string
      tags: [dropletTag],
      ssh_keys: availableSshKeyFingerprints,
      monitoring: true,
      user_data: fs.readFileSync('./cloud-init.txt', 'utf8').trim(),
      with_droplet_agent: true,
    };

    console.log('Creation config:');
    console.log(JSON.stringify({...input, user_data: input.user_data.substring(0, 13) + ' [...]'}, null, 2));

    console.log('Creating droplets...');
    const {data: {droplets}} = await dots.droplet.createDroplets(input);

    console.log(JSON.stringify(droplets));
  } catch (error) {
    console.log(error);
  }
}

async function actionList() {
  console.log('Loading list of droplets...');

  const droplets = await getActiveDroplets();

  const table = droplets.map(droplet => {
    const ipPublic = droplet.networks.v4.filter(network => network.type === 'public').map(network => network.ip_address)?.[0];

    return {
      'name': droplet.name,
      'memory': droplet.memory,
      'vcpus': droplet.vcpus,
      'disk': droplet.disk,
      'status': droplet.status,
      'created_at': droplet.created_at,
      'image': droplet.image.slug,
      'size': droplet.size.slug,
      'region': droplet.region.slug,
      'ip': ipPublic,
      'dashboard': ipPublic ? getDashboardUrl(ipPublic) : '',
    };
  });

  console.log('Current droplet count: ' + droplets.length);

  console.table(table);

  if (droplets.length < 1) {
    console.log('No droplets present.');
    return;
  }
}

async function actionListStats() {
  console.log('Loading list of droplets...');

  const droplets = await getActiveDroplets();

  const table = [];

  for(let i = 0; i < droplets.length; ++i) {
    try {
      const droplet = droplets[i];

      const ipPublic = droplet.networks.v4.filter(network => network.type === 'public').map(network => network.ip_address)?.[0];

      const stats = {
        ...(await loadNodeStats(ipPublic)),
        ...(await loadLedgerStats(ipPublic)),
        ...(await loadNetworkStats(ipPublic)),
      };

      table.push({
        'name': droplet.name,
        'memory': droplet.memory,
        'vcpus': droplet.vcpus,
        'disk': droplet.disk,
        'status': droplet.status,
        'region': droplet.region.slug,
        'ip': ipPublic,
        'stat_synced': stats.synced,
        'stat_head_height': stats.head.height,
        'stat_head_timestamp': stats.head.timestamp ? (new Date(stats.head.timestamp).toISOString()) : undefined,
        'shardGroup': stats.shardGroup,
        'connections': stats.network.connections,
        'finality_consensus': stats.ledger.finality.consensus,
        'finality_client': stats.ledger.finality.client,
      });
    }
    catch (e) {
      // @TODO: check if -v is set, the display error
      console.log(`#${i} [${droplets[i].name}]: connection error: ${e}`);
    }
  }

  console.log('Current droplet count: ' + droplets.length);

  console.table(table);

  if (droplets.length < 1) {
    console.log('No droplets present.');
    return;
  }
}


async function actionListDashboards() {
  const droplets = await getActiveDroplets();
  droplets.forEach(droplet => {
    console.log(droplet.networks.v4.filter(network => network.type === 'public').map(network => getDashboardUrl(network.ip_address))?.[0]);
  });
}

async function actionListLoads() {
  const sshKeyFile = process.argv?.[3] ?? '~/.ssh/id_ed25519';

  console.log('Loading list of droplets...');

  const droplets = await getActiveDroplets();

  console.log('Current droplet count: ' + droplets.length);

  if (droplets.length < 1) {
    console.log('No droplets present.');
    return;
  }

  console.log('Getting load values...');

  for(let i = 0; i < droplets.length; ++i) {
    try {
      const ipPublic = droplets[i].networks.v4.filter(network => network.type === 'public').map(network => network.ip_address)?.[0];

      const uptime = await executeSSHCommand(ipPublic, 'uptime', sshKeyFile);
      console.log(`#${i} [${droplets[i].name}]: ` + uptime);
    }
    catch (e) {
      // @TODO: check if -v is set, the display error
      console.log(`#${i} [${droplets[i].name}]: connection error`);
    }
  }
}

async function actionPrice() {
  const currencyFormatter = new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'});

  console.log('Loading list of droplets...');

  const droplets = await getActiveDroplets();

  const priceHourly = droplets.reduce((sum, droplet) => {
    return sum + droplet.size.price_hourly;
  }, 0);
  const priceMonthly = droplets.reduce((sum, droplet) => {
    return sum + droplet.size.price_monthly;
  }, 0);

  console.log('Current droplet count: ' + droplets.length);
  console.log('Current price monthly: ' + currencyFormatter.format(priceMonthly));
  console.log('Current price hourly:  ' + currencyFormatter.format(priceHourly));

  console.log(`Only showing costs for droplets with tag '${dropletTag}'!`);
}

async function actionDelete() {
  /* @TODO:
  const proceed = await confirm(`Do you want to delete all droplets with tag '${dropletTag}'?`);

  if (!proceed) {
    return;
  }*/

  try {
    const input = {
      tag_name: dropletTag,
    };
    const {status} = await dots.droplet.deleteDropletsByTag(input);
    console.log(status);
  } catch (error) {
    console.log(error);
  }
}


async function getActiveDroplets() {
  const input = {
    per_page: 500,
    tag_name: dropletTag,
  };
  const {data: {droplets}} = await dots.droplet.listDroplets(input);
  return droplets;
}

async function getSshKeys() {
  const input = {
    per_page: 100,
  };
  const {data: {ssh_keys}} = await dots.sshKey.listSshKeys(input);
  return ssh_keys;
}

function getDashboardUrl(ip) {
  return 'http://' + ip + ':8080/dashboard/index.html';
}

function getApiUrl(ip) {
  return 'http://' + ip + ':8080/api';
}



async function loadNodeStats(ip) {
  try {
    const url = getApiUrl(ip) + '/node';

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const jsonResponse = await response.json();

    return {
      synced: jsonResponse?.node?.synced,
      head: {
        height: jsonResponse?.node?.head?.height,
        timestamp: jsonResponse?.node?.head?.timestamp,
      },
      shardGroup: jsonResponse?.node?.shard_group,
    };
  } catch (error) {
    // console.error('Error:', error.message);
    throw error;
  }
}

async function loadNetworkStats(ip) {
  try {
    const url = getApiUrl(ip) + '/network/statistics';

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const jsonResponse = await response.json();

    return {
      network: {
        connections: jsonResponse?.statistics?.connections,
      },
    };
  } catch (error) {
    // console.error('Error:', error.message);
    throw error;
  }
}

async function loadLedgerStats(ip) {
  try {
    const url = getApiUrl(ip) + '/ledger/statistics';

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const jsonResponse = await response.json();

    return {
      ledger: {
        finality: {
          consensus: jsonResponse?.statistics?.throughput?.finality?.consensus,
          client: jsonResponse?.statistics?.throughput?.finality?.client,
        },
      },
    };
  } catch (error) {
    // console.error('Error:', error.message);
    throw error;
  }
}

async function executeSSHCommand(ip, command, sshKeyFile) {
  const sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o IdentitiesOnly=yes -i ${sshKeyFile} root@${ip} "${command}"`;

  return new Promise((resolve, reject) => {
    exec(sshCommand, (error, stdout, stderr) => {
      if (stderr) {
        // Ignore the "Permanently added" message from ssh
        stderr = stderr.replace(/Warning: Permanently added '[^']+' \(ED25519\) to the list of known hosts./, '').trim();
      }

      if (error) {
        reject(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        reject(`Stderr: ${stderr}`);
        return;
      }
      resolve(stdout.trim());
    });
  });
}


function generateRandomHex(length) {
  const byteLength = Math.ceil(length / 2); // each byte generates 2 hex characters, so divide by 2
  const randomBytes = crypto.randomBytes(byteLength);
  return randomBytes.toString('hex').slice(0, length); // ensures exact length
}

/**
 * @TODO: make this work
 */
function confirm(prompt) {
  return new Promise((resolve, reject) => {
    rl.question(prompt + " (y/n): ", (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

