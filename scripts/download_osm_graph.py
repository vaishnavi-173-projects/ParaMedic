"""Download a drivable OSMnx graph and export the schema used by ParaMedic.
The resulting road network is derived from OpenStreetMap; speed weights are explicit estimates.
"""
import argparse, json
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import osmnx as ox

SPEEDS = {
    'motorway': 55, 'trunk': 45, 'primary': 35, 'secondary': 30,
    'tertiary': 25, 'unclassified': 20, 'residential': 20,
    'living_street': 10, 'service': 15, 'road': 20
}
EXCLUDE = {'footway', 'cycleway', 'path', 'pedestrian', 'steps', 'bridleway', 'corridor'}

def road_type(value):
    if isinstance(value, list): value = value[0] if value else 'unclassified'
    return str(value or 'unclassified').split(';')[0]

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--lat',type=float,default=12.956)
    p.add_argument('--lon',type=float,default=77.708)
    p.add_argument('--radius-m',type=int,default=4000)
    p.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'engine'/'data')
    args=p.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
    ox.settings.use_cache=True; ox.settings.log_console=True
    G=ox.graph_from_point((args.lat,args.lon),dist=args.radius_m,network_type='drive',simplify=True,retain_all=False)
    # OSMnx's simplified graph already carries edge lengths computed along the original segments.
    nodes_raw=list(G.nodes(data=True)); compact={osm_id:i+1 for i,(osm_id,_) in enumerate(nodes_raw)}
    node_rows=[]
    for osm_id,d in nodes_raw: node_rows.append({'node_id':compact[osm_id],'latitude':float(d['y']),'longitude':float(d['x'])})
    edge_rows=[]; edge_id=1
    for u,v,k,d in G.edges(keys=True,data=True):
        rt=road_type(d.get('highway'))
        if rt in EXCLUDE: continue
        speed=float(SPEEDS.get(rt,20))
        # These are documented estimated average speeds, not live traffic or legal speed limits.
        length=max(float(d.get('length',1)),1.0)
        seconds=(length/(speed*1000/3600))
        edge_rows.append({'edge_id':edge_id,'source':compact[u],'target':compact[v],'length_m':round(length,2),'road_type':rt,'speed_kmh':speed,'travel_time_s':round(seconds,3)})
        edge_id+=1
    if not node_rows or not edge_rows: raise RuntimeError('OSM graph is empty after filtering; adjust location or radius.')
    pd.DataFrame(node_rows).to_csv(args.output/'nodes.csv',index=False)
    pd.DataFrame(edge_rows).to_csv(args.output/'edges.csv',index=False)
    meta={'dataset_type':'openstreetmap_derived','source':'OpenStreetMap via OSMnx','exported_utc':datetime.now(timezone.utc).isoformat(),'center':{'latitude':args.lat,'longitude':args.lon},'radius_m':args.radius_m,'units':{'distance':'metres','time':'seconds','speed':'km/h'},'node_count':len(node_rows),'directed_edge_count':len(edge_rows),'speed_assumptions_kmh':SPEEDS,'weight_formula':'travel_time_s = length_m / (speed_kmh * 1000 / 3600)','limitations':'Estimated speeds; no live traffic, road closures, siren priority, or real emergency-service integration.'}
    (args.output/'graph_metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    print(json.dumps({'output':str(args.output),'nodes':len(node_rows),'directed_edges':len(edge_rows),'metadata':meta},indent=2))
if __name__=='__main__': main()
