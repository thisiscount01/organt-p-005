import json,urllib.request
PID="36cac176-a3ff-80ee-9e7e-e9a073353bad"
def load(pid,chunk=0):
    body=json.dumps({"pageId":pid,"limit":300,"cursor":{"stack":[]},"chunkNumber":chunk,"verticalColumns":False}).encode()
    req=urllib.request.Request("https://www.notion.so/api/v3/loadPageChunk",data=body,headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req))
data=load(PID)
blocks=data["recordMap"]["block"]
def txt(props):
    if not props: return ""
    t=props.get("title")
    if not t: return ""
    out=[]
    for seg in t:
        if seg and isinstance(seg[0],str): out.append(seg[0])
    return "".join(out)
root=blocks.get(PID,{}).get("value",{})
root=root.get("value",root)
order=root.get("content",[])
seen=set()
def walk(ids,depth=0):
    for bid in ids:
        if bid in seen: continue
        seen.add(bid)
        b=blocks.get(bid)
        if not b:
            print("  "*depth+f"[MISSING {bid}]"); continue
        v=b.get("value",{})
        v=v.get("value",v)
        typ=v.get("type","?")
        props=v.get("properties",{})
        text=txt(props)
        marker=""
        fmt=v.get("format",{}) or {}
        if fmt.get("display_source"): marker=" <img:"+str(fmt["display_source"])[:80]+">"
        if text or typ in("column_list","column","divider","image","toggle","callout"):
            print("  "*depth+f"[{typ}] {text}{marker}")
        ch=v.get("content",[])
        if ch: walk(ch,depth+1)
walk(order)
print("=== total blocks in map:",len(blocks),"| root children:",len(order))
