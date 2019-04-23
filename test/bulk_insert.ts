import { OpsFactory } from "../api/ies-ops"
import { Exists } from "../search/exports"
import { IBulkOpResult } from "../ops/exports"

const ops = OpsFactory("http://localhost:9200")
const index = "docs"

const refresh = async () => {
  let res = await ops.refresh("docs")

  console.log(`Refresh: ${res._shards.json()}`)
}

class Sequence {
  static readonly DEFAULT: Sequence = new Sequence()

  static defaultNext() {
    return Sequence.DEFAULT.next()
  }

  val: number = 0

  next(): number {
    return this.val++
  }
}

const TAG = "superUniqueTagNameOfCustomDoc"

class CustomDoc {
  sequence: number = Sequence.defaultNext()
  superUniqueTagNameOfCustomDoc: string = "CD"
  timestamp: Date = new Date()
}

const makeDocsArray = (max: number) => {
  let rv: CustomDoc[] = []

  for (let ix = 0; ix < max; ix++) {
    rv.push(new CustomDoc())
  }

  return rv
}

const makeDocsStream = function*(max: number) {
  for (let ix = 0; ix < max; ix++) {
    yield new CustomDoc()
  }
}

const run_bulk_insert = async (
  src: Array<CustomDoc> | IterableIterator<CustomDoc>
) => {
  let del = await ops.deleteMatching(index, Exists.exists(TAG).asRoot())

  if (del.total > 0) {
    console.log(`Deleted ${del.total}`)
    await refresh()
  }

  let stream = ops.bulkInsert(index, src, false, 100, doc => "" + doc.sequence)

  let root: IBulkOpResult = null

  for (const pres of stream) {
    let res = await pres

    /*
     * Reduce BulkInsert Result. This is not required and not advised if outputItems is set to true,
     * because it will concatenate every partial list of Item instances into a single one, which may
     * cause an OOM error.
     *
     * This is useful to accumulate the total time taken for all round trips as well as finding out wether
     * an error has ocurred during the operation or not.
     */
    if (root) {
      root = root.merge(res)
    } else {
      root = res
    }
  }

  return root
}

const do_bulk_insert = async () => {
  let res = await run_bulk_insert(makeDocsArray(10000))
  console.log(`[Array]Merged Bulk Insert Status: ${JSON.stringify(res)}`)
  await refresh()
  let count = await ops.count(index, Exists.exists(TAG).asRoot())
  console.log(`[Array]Post Insert Count:${count}`)

  res = await run_bulk_insert(makeDocsStream(10000))
  console.log(`[Stream]Merged Bulk Insert Status: ${JSON.stringify(res)}`)
  await refresh()
  count = await ops.count(index, Exists.exists(TAG).asRoot())
  console.log(`[Stream]Post Insert Count:${count}`)
}

do_bulk_insert().finally(() => ops.close())
