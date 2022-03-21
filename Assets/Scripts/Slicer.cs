using System.Collections;
using EzySlice;
using UnityEngine;

public class Slicer : MonoBehaviour
{
    public Material materialAfterSlice;
    public LayerMask sliceMask;
    public bool isTouched;

    private int slices = 0;

    private void Update()
    {
        if (isTouched)
        {
            isTouched = false;

            var objectsToBeSliced = Physics.OverlapBox(transform.position, new Vector3(1, 0.1f, 0.1f),
                transform.rotation, sliceMask);

            foreach (var objectToBeSliced in objectsToBeSliced)
            {
                var slicedObject = SliceObject(objectToBeSliced.gameObject, materialAfterSlice);

                var upperHullGameobject = slicedObject.CreateUpperHull(objectToBeSliced.gameObject, materialAfterSlice);
                var lowerHullGameobject = slicedObject.CreateLowerHull(objectToBeSliced.gameObject, materialAfterSlice);


                upperHullGameobject.transform.position = objectToBeSliced.transform.position;
                lowerHullGameobject.transform.position = objectToBeSliced.transform.position;

                upperHullGameobject.transform.rotation = objectToBeSliced.transform.rotation;
                lowerHullGameobject.transform.rotation = objectToBeSliced.transform.rotation;


                MakeItPhysical(upperHullGameobject, false);
                MakeItPhysical(lowerHullGameobject, true);


                Destroy(objectToBeSliced.gameObject);
            }
        }
    }

    private void MakeItPhysical(GameObject obj, bool side)
    {
        obj.AddComponent<MeshCollider>().convex = true;
        obj.AddComponent<Rigidbody>();
        obj.GetComponent<Rigidbody>().useGravity = true;
        if (side) obj.GetComponent<Rigidbody>().velocity = Vector3.right * 2.0f;
        if (!side) obj.GetComponent<Rigidbody>().velocity = Vector3.left * 2.0f;

        StartCoroutine(SliceAgain(obj));

        IEnumerator SliceAgain(GameObject o)
        {
            yield return new WaitForSeconds(0.2f);
            obj.layer = getLayer();
        }

        //StartCoroutine(DropThrough(obj));
        StartCoroutine(DestroyDebris(obj));

        IEnumerator DestroyDebris(GameObject o)
        {
            yield return new WaitForSeconds(1.0f);
            Destroy(o);
        }
    }

    private int getLayer()
    {
        var layerNumber = 0;
        var layer = sliceMask.value;
        while (layer > 0)
        {
            layer = layer >> 1;
            layerNumber++;
        }

        return layerNumber - 1;
    }

    private SlicedHull SliceObject(GameObject obj, Material crossSectionMaterial = null)
    {
        return obj.Slice(transform.position, transform.up, crossSectionMaterial);
    }
}
