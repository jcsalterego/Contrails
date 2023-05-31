import dotenv from 'dotenv'
import { AtpAgent, BlobRef } from '@atproto/api'
import fs from 'fs/promises'

const run = async () => {
  dotenv.config()
  let config = require("./config.json");
  const handle = `${process.env.BLUESKY_HANDLE}`
  const password = `${process.env.BLUESKY_APP_PASSWORD}`
  const recordName = config.recordName;
  const displayName = config.displayName;
  const description = config.description;
  const avatar: string = config.avatar;

  // -------------------------------------
  // NO NEED TO TOUCH ANYTHING BELOW HERE
  // -------------------------------------

  const feedGenDid = `did:web:${process.env.FEEDGEN_HOSTNAME}`
  console.log(`did:web:${process.env.FEEDGEN_HOSTNAME}`)

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  try {
    await agent.api.app.bsky.feed.describeFeedGenerator()
  } catch (err) {
    throw new Error(
      'The bluesky server is not ready to accept published custom feeds yet',
    )
  }

  let avatarRef: BlobRef | undefined
  if (avatar) {
    let encoding: string
    if (avatar.endsWith('png')) {
      encoding = 'image/png'
    } else if (avatar.endsWith('jpg') || avatar.endsWith('jpeg')) {
      encoding = 'image/jpeg'
    } else {
      throw new Error('expected png or jpeg')
    }
    const img = await fs.readFile(avatar)
    const blobRes = await agent.api.com.atproto.repo.uploadBlob(img, {
      encoding,
    })
    avatarRef = blobRes.data.blob
  }

  let record = {
    repo: agent.session?.did ?? '',
    collection: 'app.bsky.feed.generator',
    rkey: recordName,
    record: {
      did: feedGenDid,
      displayName: displayName,
      description: description,
      avatar: avatarRef,
      createdAt: new Date().toISOString(),
    },
  }
  console.log(JSON.stringify(record, null, 2));
  await agent.api.com.atproto.repo.putRecord(record);
  console.log('All done 🎉')
}

run()
