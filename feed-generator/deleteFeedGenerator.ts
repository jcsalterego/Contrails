import dotenv from 'dotenv'
import {AtpAgent} from '@atproto/api'

const run = async () => {
  dotenv.config()
  let config = require("./config.json");
  const handle = `${process.env.BLUESKY_HANDLE}`
  const password = `${process.env.BLUESKY_APP_PASSWORD}`
  const recordName = `${process.env.RECORD_NAME}`

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  let record = {
    repo: agent.session?.did ?? '',
    collection: 'app.bsky.feed.generator',
    rkey: recordName,
  }
  let recordJSON = JSON.stringify(record, null, 2);
  console.log(`Deleting record ${recordJSON}`)
  let response = await agent.api.com.atproto.repo.deleteRecord(record);
  let responseJSON = JSON.stringify(response, null, 2);
  console.log(`Response: ${responseJSON}`)
}

run()
